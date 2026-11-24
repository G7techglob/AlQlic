
import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    doc,
    setDoc,
    updateDoc,
    deleteDoc,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";


console.log("AlQlic Streaming JS loaded");


// ===================================
// HTML ELEMENTS
// ===================================

const liveStreams = document.getElementById("liveStreams");
const noLiveStreams = document.getElementById("noLiveStreams");

const liveTab = document.getElementById("liveTab");
const videoTab = document.getElementById("videoTab");

const liveSection = document.getElementById("liveSection");
const videoSection = document.getElementById("videoSection");

const videoFeed = document.getElementById("videoFeed");

const streamSearch = document.getElementById("streamSearch");
const clearStreamSearch = document.getElementById("clearStreamSearch");


// ===================================
// WEBRTC SETTINGS
// ===================================

const rtcConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};


// ===================================
// GLOBAL STATE
// ===================================

let currentUser = null;
let currentSearchText = "";
let soundEnabled = false;

let unsubscribeLiveStreams = null;
let unsubscribeSavedVideos = null;

const feedConnections = new Map();
const visibleCards = new Map();

let feedObserver = null;


// ===================================
// ESCAPE HTML
// ===================================

function escapeHTML(value = "") {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


// ===================================
// UPDATE SOUND BUTTON
// ===================================

function updateSoundButton(connection) {

    if (!connection || !connection.soundButton) return;

    connection.soundButton.innerHTML = connection.video.muted
        ? '<i class="fa-solid fa-volume-xmark"></i>'
        : '<i class="fa-solid fa-volume-high"></i>';

}


// ===================================
// STOP ONE LIVE CONNECTION
// ===================================

async function stopFeedConnection(streamId) {

    const connection = feedConnections.get(streamId);

    if (!connection || connection.isClosing) return;

    connection.isClosing = true;

    feedConnections.delete(streamId);

    connection.unsubscribers.forEach(unsubscribe => {
        try {
            unsubscribe();
        } catch (_) {}
    });

    connection.unsubscribers = [];

    try {
        connection.pc.close();
    } catch (_) {}

    connection.video.srcObject = null;
    connection.video.muted = true;

    updateSoundButton(connection);

    try {
        await updateDoc(connection.viewerRef, {
            status: "disconnected",
            leftAt: serverTimestamp()
        });
    } catch (_) {}

    try {
        await deleteDoc(connection.offerRef);
    } catch (_) {}

}


// ===================================
// STOP ALL LIVE CONNECTIONS
// ===================================

function stopAllFeedConnections() {

    for (const streamId of [...feedConnections.keys()]) {
        stopFeedConnection(streamId);
    }

}


// ===================================
// CONNECT TO A LIVE STREAM
// ===================================

async function startFeedConnection(card) {

    if (!currentUser || !card || !card.isConnected) return;

    const streamId = card.dataset.streamId;

    if (!streamId || feedConnections.has(streamId)) return;

    const video = card.querySelector(".live-feed-video");
    const soundButton = card.querySelector(".live-sound-btn");

    if (!video || !soundButton) return;


    // UNIQUE VIEWER SESSION

    const sessionId =
        currentUser.uid + "_" +
        Date.now() + "_" +
        Math.random().toString(36).slice(2, 10);


    // FIRESTORE REFERENCES

    const viewerRef = doc(
        db,
        "liveStreams",
        streamId,
        "viewers",
        sessionId
    );

    const offerRef = doc(
        db,
        "liveStreams",
        streamId,
        "offers",
        sessionId
    );


    // CREATE PEER CONNECTION

    const pc = new RTCPeerConnection(rtcConfig);


    const connection = {
        pc,
        video,
        soundButton,
        viewerRef,
        offerRef,
        sessionId,
        unsubscribers: [],
        isClosing: false
    };


    feedConnections.set(streamId, connection);


    // RECEIVE HOST VIDEO AND AUDIO

    pc.ontrack = event => {

        if (connection.isClosing) return;

        if (event.streams && event.streams[0]) {

            video.srcObject = event.streams[0];

        } else {

            if (!video.srcObject) {
                video.srcObject = new MediaStream();
            }

            video.srcObject.addTrack(event.track);

        }

        video.play().catch(error => {
            console.warn("Live video autoplay blocked:", error);
        });

    };


    // SEND VIEWER ICE CANDIDATES TO HOST

    pc.onicecandidate = async event => {

        if (!event.candidate || connection.isClosing) return;

        try {

            await addDoc(
                collection(viewerRef, "viewerCandidates"),
                event.candidate.toJSON()
            );

        } catch (error) {

            console.error("Viewer ICE error:", error);

        }

    };


    // CONNECTION STATUS

    pc.onconnectionstatechange = () => {

        console.log(
            "Feed connection:",
            streamId,
            pc.connectionState
        );

        if (pc.connectionState === "failed") {
            stopFeedConnection(streamId);
        }

    };


    // SOUND BUTTON

    soundButton.addEventListener("click", async event => {

        event.stopPropagation();

        soundEnabled = !soundEnabled;

        // Keep only this stream audible.

        for (const [otherId, otherConnection] of feedConnections) {

            if (otherId !== streamId) {

                otherConnection.video.muted = true;

                updateSoundButton(otherConnection);

            }

        }

        video.muted = !soundEnabled;

        updateSoundButton(connection);

        try {

            await video.play();

        } catch (error) {

            console.warn("Could not play live audio:", error);

            video.muted = true;

            updateSoundButton(connection);

        }

    });


    try {

        // CREATE VIEWER DOCUMENT

        await setDoc(viewerRef, {
            userId: currentUser.uid,
            status: "connecting",
            joinedAt: serverTimestamp()
        });

        if (connection.isClosing) return;


        // LISTEN FOR HOST ANSWER

        const unsubscribeAnswer = onSnapshot(
            viewerRef,
            async snapshot => {

                if (connection.isClosing || !snapshot.exists()) return;

                const data = snapshot.data();

                if (
                    data.answer &&
                    !pc.currentRemoteDescription
                ) {

                    try {

                        await pc.setRemoteDescription(
                            new RTCSessionDescription(data.answer)
                        );

                        // Add any host candidates received early.

                        for (const candidate of pendingHostCandidates) {

                            try {
                                await pc.addIceCandidate(candidate);
                            } catch (error) {
                                console.warn("Queued ICE error:", error);
                            }

                        }

                        pendingHostCandidates.length = 0;

                    } catch (error) {

                        console.error("Host answer error:", error);

                    }

                }

            },
            error => {
                console.error("Answer listener error:", error);
            }
        );

        connection.unsubscribers.push(unsubscribeAnswer);


        // LISTEN FOR HOST ICE CANDIDATES

        const pendingHostCandidates = [];

        const unsubscribeHostCandidates = onSnapshot(
            collection(viewerRef, "hostCandidates"),
            snapshot => {

                snapshot.docChanges().forEach(async change => {

                    if (
                        change.type !== "added" ||
                        connection.isClosing
                    ) return;

                    try {

                        const candidate = new RTCIceCandidate(
                            change.doc.data()
                        );

                        if (pc.remoteDescription) {

                            await pc.addIceCandidate(candidate);

                        } else {

                            pendingHostCandidates.push(candidate);

                        }

                    } catch (error) {

                        console.warn("Host ICE candidate error:", error);

                    }

                });

            },
            error => {
                console.error("Host candidate listener error:", error);
            }
        );

        connection.unsubscribers.push(unsubscribeHostCandidates);


        // CREATE VIEWER OFFER

        const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });

        if (connection.isClosing) return;

        await pc.setLocalDescription(offer);

        if (connection.isClosing) return;


        // SEND OFFER TO HOST

        await setDoc(offerRef, {

            offer: pc.localDescription.toJSON(),

            viewerId: currentUser.uid,

            createdAt: serverTimestamp()

        });

        if (connection.isClosing) return;


        // START VIDEO MUTED OR WITH PREVIOUS SOUND CHOICE

        video.muted = !soundEnabled;

        updateSoundButton(connection);

        video.play().catch(error => {
            console.warn("Waiting for live video:", error);
        });


    } catch (error) {

        console.error("Could not connect to live stream:", error);

        stopFeedConnection(streamId);

    }

}


// ===================================
// CHOOSE THE MOST VISIBLE LIVE CARD
// ===================================

function updateVisibleLiveCard() {

    const activeLive =
        liveTab && liveTab.classList.contains("active");

    if (!activeLive) {

        stopAllFeedConnections();

        return;

    }


    let bestCard = null;
    let highestRatio = 0;

    for (const [card, ratio] of visibleCards) {

        if (
            !card.isConnected ||
            card.style.display === "none"
        ) continue;

        if (ratio > highestRatio) {

            highestRatio = ratio;
            bestCard = card;

        }

    }


    // Require a reasonably visible card.

    if (!bestCard || highestRatio < 0.35) {

        stopAllFeedConnections();

        return;

    }


    const selectedStreamId = bestCard.dataset.streamId;


    // Stop other stream connections.

    for (const streamId of [...feedConnections.keys()]) {

        if (streamId !== selectedStreamId) {
            stopFeedConnection(streamId);
        }

    }


    // Connect to selected stream.

    startFeedConnection(bestCard);

}


// ===================================
// WATCH WHICH LIVE CARD IS ON SCREEN
// ===================================

function setupFeedObserver() {

    if (feedObserver) {
        feedObserver.disconnect();
    }

    feedObserver = new IntersectionObserver(
        entries => {

            entries.forEach(entry => {

                if (entry.isIntersecting) {

                    visibleCards.set(
                        entry.target,
                        entry.intersectionRatio
                    );

                } else {

                    visibleCards.delete(entry.target);

                }

            });

            updateVisibleLiveCard();

        },
        {
            threshold: [0, 0.25, 0.35, 0.5, 0.75, 1]
        }
    );


    document.querySelectorAll(".live-card").forEach(card => {
        feedObserver.observe(card);
    });

}


// ===================================
// FILTER LIVE STREAMS AND VIDEOS
// ===================================

function filterStreamResults() {

    if (!streamSearch) return;

    currentSearchText = streamSearch.value
        .trim()
        .toLowerCase();

    const activeLive =
        liveTab && liveTab.classList.contains("active");

    const container = activeLive
        ? liveStreams
        : videoFeed;

    if (!container) return;

    const selector = activeLive
        ? ".live-card"
        : ".video-card";

    const cards = Array.from(
        container.querySelectorAll(selector)
    );

    let visibleCount = 0;

    cards.forEach(card => {

        const searchableText = (
            card.dataset.searchText || card.textContent
        ).toLowerCase();

        const matches = searchableText.includes(currentSearchText);

        card.style.display = matches ? "" : "none";

        if (matches) {

            visibleCount++;

            if (activeLive && feedObserver) {
                feedObserver.observe(card);
            }

        } else if (activeLive) {

            visibleCards.delete(card);

            if (feedObserver) {
                feedObserver.unobserve(card);
            }

            stopFeedConnection(card.dataset.streamId);

        }

    });


    // LIVE EMPTY MESSAGE

    if (activeLive && noLiveStreams) {

        if (cards.length === 0) {

            noLiveStreams.style.display = "block";
            noLiveStreams.textContent = "Nobody is live right now.";

        } else if (visibleCount === 0) {

            noLiveStreams.style.display = "block";
            noLiveStreams.textContent =
                "No matching live streamers found.";

        } else {

            noLiveStreams.style.display = "none";

        }

    }


    // VIDEO EMPTY MESSAGE

    if (!activeLive) {

        let noMatchingVideos = document.getElementById(
            "noMatchingVideos"
        );

        if (!noMatchingVideos) {

            noMatchingVideos = document.createElement("p");

            noMatchingVideos.id = "noMatchingVideos";
            noMatchingVideos.className = "empty-message";
            noMatchingVideos.textContent = "No matching videos found.";

            videoFeed.appendChild(noMatchingVideos);

        }

        noMatchingVideos.style.display =
            cards.length > 0 && visibleCount === 0
                ? "block"
                : "none";

    }

    updateVisibleLiveCard();

}


// ===================================
// SEARCH WHILE TYPING
// ===================================

if (streamSearch) {

    streamSearch.addEventListener(
        "input",
        filterStreamResults
    );

}


// ===================================
// CLEAR SEARCH
// ===================================

if (clearStreamSearch) {

    clearStreamSearch.addEventListener("click", () => {

        streamSearch.value = "";

        filterStreamResults();

        streamSearch.focus();

    });

}


// ===================================
// SWITCH TO LIVE TAB
// ===================================

if (liveTab) {

    liveTab.addEventListener("click", () => {

        liveTab.classList.add("active");

        videoTab.classList.remove("active");

        liveSection.style.display = "block";

        videoSection.style.display = "none";

        if (streamSearch) {

            streamSearch.placeholder = "Search live streamers...";

            streamSearch.value = "";

        }

        filterStreamResults();

        setupFeedObserver();

    });

}


// ===================================
// SWITCH TO VIDEOS TAB
// ===================================

if (videoTab) {

    videoTab.addEventListener("click", () => {

        videoTab.classList.add("active");

        liveTab.classList.remove("active");

        liveSection.style.display = "none";

        videoSection.style.display = "block";

        if (streamSearch) {

            streamSearch.placeholder = "Search saved videos...";

            streamSearch.value = "";

        }

        visibleCards.clear();

        stopAllFeedConnections();

        filterStreamResults();

    });

}


// ===================================
// LOAD LIVE STREAMS
// ===================================

function loadLiveStreams() {

    const streamsQuery = query(
        collection(db, "liveStreams"),
        where("status", "==", "live")
    );

    unsubscribeLiveStreams = onSnapshot(
        streamsQuery,

      snapshot => {

    // Do not rebuild live cards when only an existing
    // stream document has been updated, such as a Like.

    const changes = snapshot.docChanges();

    const onlyModified =
        changes.length > 0 &&
        changes.every(change => change.type === "modified");

    if (onlyModified && liveStreams.children.length > 0) {
        return;
    }

    stopAllFeedConnections();

    visibleCards.clear();

    liveStreams.innerHTML = "";

            if (snapshot.empty) {

                noLiveStreams.style.display = "block";

                noLiveStreams.textContent =
                    "Nobody is live right now.";

                return;

            }

            noLiveStreams.style.display = "none";


            snapshot.forEach(docSnap => {

                const stream = docSnap.data();

                const streamId = docSnap.id;

                const hostPhoto =
                    stream.hostPhoto || "default-profile.png";

                const hostName =
                    stream.hostName || "AlQlic User";

                const hostUsername =
                    stream.hostUsername || "";

                const streamTitle =
                    stream.title || "Live Stream";

                const viewers =
                    Number(stream.viewerCount) || 0;


                // CREATE LIVE CARD

                const card = document.createElement("div");

                card.className = "live-card";

                card.dataset.streamId = streamId;

                card.dataset.searchText = [
                    hostName,
                    hostUsername,
                    streamTitle
                ].join(" ").toLowerCase();


                // LIVE CARD CONTENT

                card.innerHTML = `

                    <div class="live-preview">

                        <video
                            class="live-feed-video"
                            autoplay
                            muted
                            playsinline
                            poster="${escapeHTML(hostPhoto)}"
                        ></video>

                        <span class="live-badge">
                            🔴 LIVE
                        </span>

                        <span class="viewer-count">

                            <i class="fa-solid fa-eye"></i>

                            ${viewers}

                        </span>

                        <button
                            type="button"
                            class="live-sound-btn"
                            aria-label="Enable sound"
                        >
                            <i class="fa-solid fa-volume-xmark"></i>
                        </button>

                    </div>


                    <div class="live-info">

                        <h4>
                            ${escapeHTML(streamTitle)}
                        </h4>

                        <div class="live-user">

                            <img
                                src="${escapeHTML(hostPhoto)}"
                                alt=""
                                onerror="this.src='default-profile.png'"
                            >

                            <span>
                                ${escapeHTML(hostName)}
                            </span>

                        </div>

                    </div>

                `;


                // OPEN FULL LIVE PAGE WHEN CARD IS TAPPED

                card.addEventListener("click", () => {

                    window.location.href =
                        `watch-live.html?streamId=${encodeURIComponent(streamId)}`;

                });


                liveStreams.appendChild(card);

            });


            filterStreamResults();

            if (feedObserver) {
                setupFeedObserver();
            }

        },

        error => {

            console.error("Error loading live streams:", error);

            noLiveStreams.style.display = "block";

            noLiveStreams.textContent =
                "Unable to load live streams.";

        }
    );

}


// ===================================
// LOAD SAVED LIVE VIDEOS
// ===================================

function loadSavedVideos() {

    const savedVideosQuery = query(

        collection(db, "liveStreams"),

        where("status", "==", "ended"),

        where("videoSaved", "==", true),

        orderBy("endedAt", "desc")

    );


    unsubscribeSavedVideos = onSnapshot(

        savedVideosQuery,

        snapshot => {

            videoFeed.innerHTML = "";


            if (snapshot.empty) {

                videoFeed.innerHTML = `
                    <p class="empty-message">
                        No saved live videos yet.
                    </p>
                `;

                return;

            }


            snapshot.forEach(docSnap => {

                const stream = docSnap.data();

                const streamId = docSnap.id;

                const title =
                    stream.title || "Live Stream";

                const hostName =
                    stream.hostName || "AlQlic User";

                const hostUsername =
                    stream.hostUsername || "";

                const hostPhoto =
                    stream.hostPhoto || "default-profile.png";


                const card = document.createElement("div");

                card.className = "video-card";

                card.dataset.searchText = [
                    title,
                    hostName,
                    hostUsername
                ].join(" ").toLowerCase();


                card.innerHTML = `

                    <div class="video-thumbnail">

                        <img
                            src="${escapeHTML(hostPhoto)}"
                            alt="${escapeHTML(hostName)}"
                            onerror="this.src='default-profile.png'"
                        >

                        <span class="play-icon">
                            <i class="fa-solid fa-play"></i>
                        </span>

                    </div>


                    <div class="video-info">

                        <h4>
                            ${escapeHTML(title)}
                        </h4>

                        <div class="video-user">

                            <img
                                src="${escapeHTML(hostPhoto)}"
                                alt=""
                                onerror="this.src='default-profile.png'"
                            >

                            <span>
                                ${escapeHTML(hostName)}
                            </span>

                        </div>

                    </div>

                `;


                card.addEventListener("click", () => {

                    window.location.href =
                        `watch-live.html?streamId=${encodeURIComponent(streamId)}&recorded=true`;

                });


                videoFeed.appendChild(card);

            });


            filterStreamResults();

        },

        error => {

            console.error("Error loading saved videos:", error);

            videoFeed.innerHTML = `
                <p class="empty-message">
                    Unable to load saved videos.
                </p>
            `;

        }

    );

}


// ===================================
// AUTHENTICATION AND STARTUP
// ===================================

onAuthStateChanged(auth, user => {

    currentUser = user;


    if (!user) {

        stopAllFeedConnections();

        if (noLiveStreams) {

            noLiveStreams.style.display = "block";

            noLiveStreams.textContent =
                "Please log in to watch live streams.";

        }

        return;

    }


    // Start listeners only once.

    if (!unsubscribeLiveStreams) {

        setupFeedObserver();

        loadLiveStreams();

        loadSavedVideos();

    }

});


// ===================================
// CLEAN UP WHEN LEAVING PAGE
// ===================================

window.addEventListener("pagehide", () => {

    stopAllFeedConnections();

    if (feedObserver) {
        feedObserver.disconnect();
    }

});
