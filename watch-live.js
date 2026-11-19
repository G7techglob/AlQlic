
import { auth, db } from "./firebase.js";

import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    collection,
    addDoc,
    onSnapshot,
    increment,
    serverTimestamp,
     writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";


console.log("AlQlic Watch Live JS loaded");


// =====================================================
// GET STREAM ID
// =====================================================

const params = new URLSearchParams(window.location.search);
const streamId = params.get("streamId");


// =====================================================
// PAGE ELEMENTS
// =====================================================

const remoteVideo = document.getElementById("remoteVideo");

const title = document.getElementById("title");
const streamTitle = document.getElementById("streamTitle");

const viewerCount = document.getElementById("viewerCount");
const hostInfo = document.getElementById("hostInfo");

const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");

const likeBtn = document.getElementById("likeBtn");
const likeCount = document.getElementById("likeCount");

const liveCommentsOverlay =
    document.getElementById("liveCommentsOverlay");

const liveLikesOverlay =
    document.getElementById("liveLikesOverlay");

const liveGiftsOverlay =
    document.getElementById("liveGiftsOverlay");

const giftBtn = document.getElementById("giftBtn");
const shareBtn = document.getElementById("shareBtn");
const backBtn = document.getElementById("backBtn");


// =====================================================
// VARIABLES
// =====================================================

let peerConnection = null;

let viewerId = null;
let currentUser = null;
let creatorId = null;

let viewerAnswerRef = null;
let viewerOfferRef = null;

let streamEnded = false;
let cleanupStarted = false;

let unsubscribeAnswer = null;
let unsubscribeHostCandidates = null;
let unsubscribeChat = null;
let unsubscribeStreamStats = null;
let unsubscribeLikeEvents = null;


// =====================================================
// WEBRTC CONFIGURATION
// =====================================================

const rtcConfig = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        },
        {
            urls: "stun:stun1.l.google.com:19302"
        }
    ]
};


// =====================================================
// CHECK STREAM ID
// =====================================================

if (!streamId) {

    alert("Live stream not found.");

    window.location.href = "stream.html";

}


// =====================================================
// BACK BUTTON
// =====================================================

if (backBtn) {

    backBtn.addEventListener("click", () => {

        cleanupViewer();

        window.history.back();

    });

}


// =====================================================
// AUTHENTICATION
// =====================================================

auth.onAuthStateChanged(async user => {

    if (!user) {

        alert("Please log in to watch this live stream.");

        window.location.href = "login.html";

        return;

    }

    currentUser = user;
    viewerId = user.uid;

    try {

        await loadStream();

        if (streamEnded) {
            return;
        }

        await joinLive();

        listenForChat();

        listenForStreamStats();

        listenForLikeEvents();

    } catch (error) {

        console.error("Watch Live startup error:", error);

        alert("Unable to join this live stream. Please try again.");

    }

});


// =====================================================
// LOAD STREAM
// =====================================================

async function loadStream() {

    const streamRef = doc(
        db,
        "liveStreams",
        streamId
    );

    const streamSnap = await getDoc(streamRef);

    if (!streamSnap.exists()) {

        alert("This live stream does not exist.");

        streamEnded = true;

        window.location.href = "stream.html";

        return;

    }

    const stream = streamSnap.data();

    creatorId = stream.hostId || null;

    if (stream.status !== "live") {

        alert("This live stream has ended.");

        streamEnded = true;

        window.location.href = "stream.html";

        return;

    }

    const streamName = stream.title || "AlQlic Live";

    if (title) {
        title.textContent = streamName;
    }

    if (streamTitle) {
        streamTitle.textContent = streamName;
    }

    if (viewerCount) {
        viewerCount.textContent = stream.viewerCount || 0;
    }

    if (hostInfo) {
        hostInfo.textContent = stream.hostName || "AlQlic User";
    }

    if (likeCount) {
        likeCount.textContent = stream.likes || 0;
    }

}


// =====================================================
// LIVE STREAM STATISTICS
// =====================================================

function listenForStreamStats() {

    const streamRef = doc(
        db,
        "liveStreams",
        streamId
    );

    unsubscribeStreamStats = onSnapshot(

        streamRef,

        snapshot => {

            if (!snapshot.exists()) {
                return;
            }

            const stream = snapshot.data();

            if (viewerCount) {
                viewerCount.textContent = stream.viewerCount || 0;
            }

            if (likeCount) {
                likeCount.textContent = stream.likes || 0;
            }

            if (stream.status !== "live" && !streamEnded) {

                streamEnded = true;

                alert("This live stream has ended.");

                cleanupViewer();

                window.location.href = "stream.html";

            }

        },

        error => {

            console.error("Live statistics error:", error);

        }

    );

}


// =====================================================
// JOIN LIVE
// =====================================================

async function joinLive() {

    if (streamEnded || !viewerId) {
        return;
    }

    console.log("Joining AlQlic live stream...");

    peerConnection = new RTCPeerConnection(rtcConfig);

    let pendingHostCandidates = [];
    let remoteDescriptionReady = false;
    let answerApplied = false;


    // =================================================
    // RECEIVE HOST VIDEO AND AUDIO
    // =================================================

    peerConnection.ontrack = event => {

        console.log("Host media received");

        if (
            event.streams &&
            event.streams[0] &&
            remoteVideo
        ) {

            remoteVideo.srcObject = event.streams[0];

            remoteVideo.play().catch(error => {

                console.log(
                    "Video playback requires user interaction:",
                    error
                );

            });

        }

    };


    // =================================================
    // SEND VIEWER ICE CANDIDATES
    // =================================================

    peerConnection.onicecandidate = async event => {

        if (!event.candidate) {
            return;
        }

        try {

            await addDoc(

                collection(
                    db,
                    "liveStreams",
                    streamId,
                    "viewers",
                    viewerId,
                    "viewerCandidates"
                ),

                event.candidate.toJSON()

            );

        } catch (error) {

            console.error("Viewer ICE error:", error);

        }

    };


    // =================================================
    // CONNECTION STATE
    // =================================================

    peerConnection.onconnectionstatechange = () => {

        if (!peerConnection) {
            return;
        }

        const state = peerConnection.connectionState;

        console.log("WebRTC connection:", state);

        if (state === "failed") {

            console.error("WebRTC connection failed.");

        }

    };


    // =================================================
    // CREATE VIEWER OFFER
    // =================================================

    const offer = await peerConnection.createOffer({

        offerToReceiveAudio: true,

        offerToReceiveVideo: true

    });

    await peerConnection.setLocalDescription(offer);


    // =================================================
    // SAVE VIEWER OFFER
    // =================================================

    viewerOfferRef = doc(
        db,
        "liveStreams",
        streamId,
        "offers",
        viewerId
    );

    await setDoc(viewerOfferRef, {

        type: offer.type,

        sdp: offer.sdp,

        viewerId: viewerId,

        createdAt: serverTimestamp()

    });

    console.log("Viewer offer sent");


    // =================================================
    // VIEWER ANSWER DOCUMENT
    // =================================================

    viewerAnswerRef = doc(
        db,
        "liveStreams",
        streamId,
        "viewers",
        viewerId
    );


    // =================================================
    // LISTEN FOR HOST ICE CANDIDATES
    // =================================================

    const hostCandidatesRef = collection(
        db,
        "liveStreams",
        streamId,
        "viewers",
        viewerId,
        "hostCandidates"
    );

    unsubscribeHostCandidates = onSnapshot(

        hostCandidatesRef,

        async snapshot => {

            for (const change of snapshot.docChanges()) {

                if (change.type !== "added") {
                    continue;
                }

                const candidateData = change.doc.data();

                if (!candidateData || !peerConnection) {
                    continue;
                }

                try {

                    if (!remoteDescriptionReady) {

                        pendingHostCandidates.push(candidateData);

                        continue;

                    }

                    await peerConnection.addIceCandidate(
                        new RTCIceCandidate(candidateData)
                    );

                    console.log("Host ICE candidate added");

                } catch (error) {

                    console.error("Host ICE error:", error);

                }

            }

        },

        error => {

            console.error("Host ICE listener error:", error);

        }

    );


    // =================================================
    // LISTEN FOR HOST ANSWER
    // =================================================

    unsubscribeAnswer = onSnapshot(

        viewerAnswerRef,

        async snapshot => {

            if (
                !snapshot.exists() ||
                !peerConnection ||
                answerApplied
            ) {
                return;
            }

            const data = snapshot.data();

            if (!data.answer) {
                return;
            }

            try {

                answerApplied = true;

                await peerConnection.setRemoteDescription(

                    new RTCSessionDescription(data.answer)

                );

                remoteDescriptionReady = true;

                console.log("Host answer received");


                // PROCESS HOST ICE CANDIDATES
                // THAT ARRIVED BEFORE THE ANSWER

                for (const candidateData of pendingHostCandidates) {

                    try {

                        await peerConnection.addIceCandidate(

                            new RTCIceCandidate(candidateData)

                        );

                    } catch (error) {

                        console.error(
                            "Pending host ICE error:",
                            error
                        );

                    }

                }

                pendingHostCandidates = [];

                console.log("Host ICE candidates processed");

            } catch (error) {

                answerApplied = false;

                console.error("Remote description error:", error);

            }

        },

        error => {

            console.error("Host answer listener error:", error);

        }

    );

}


// =====================================================
// LIVE CHAT
// =====================================================

function listenForChat() {

    const commentsRef = collection(
        db,
        "liveStreams",
        streamId,
        "messages"
    );

    unsubscribeChat = onSnapshot(

        commentsRef,

        snapshot => {

            if (!chatMessages) {
                return;
            }

            const messages = [];

            snapshot.forEach(commentDoc => {

                messages.push(commentDoc.data());

            });

            messages.sort((a, b) => {

                const timeA = a.createdAt?.toMillis?.() || 0;

                const timeB = b.createdAt?.toMillis?.() || 0;

                return timeA - timeB;

            });


            // DISPLAY CHAT PANEL

            chatMessages.innerHTML = "";

            messages.forEach(comment => {

                const message = document.createElement("div");

                message.className = "chat-message";

                const username = escapeHTML(
                    comment.username || "User"
                );

                const messageText = escapeHTML(
                    comment.text || ""
                );

                message.innerHTML = `
                    <strong>${username}</strong>
                    <span>${messageText}</span>
                `;

                chatMessages.appendChild(message);

            });

            chatMessages.scrollTop = chatMessages.scrollHeight;


            // DISPLAY COMMENTS OVER THE VIDEO

            if (liveCommentsOverlay) {

                liveCommentsOverlay.innerHTML = "";

                const recentMessages = messages.slice(-4);

                recentMessages.forEach(comment => {

                    const floatingComment = document.createElement("div");

                    floatingComment.className = "floating-live-comment";

                    const username = escapeHTML(
                        comment.username || "User"
                    );

                    const messageText = escapeHTML(
                        comment.text || ""
                    );

                    floatingComment.innerHTML = `
                        <strong>${username}</strong>
                        <span>${messageText}</span>
                    `;

                    liveCommentsOverlay.appendChild(floatingComment);

                });

            }

        },

        error => {

            console.error("Live chat error:", error);

        }

    );

}


// =====================================================
// SEND CHAT
// =====================================================

if (sendChatBtn) {

    sendChatBtn.addEventListener("click", sendChat);

}

if (chatInput) {

    chatInput.addEventListener("keydown", event => {

        if (
            event.key === "Enter" &&
            !event.shiftKey
        ) {

            event.preventDefault();

            sendChat();

        }

    });

}


async function sendChat() {

    if (!chatInput || !currentUser || streamEnded) {
        return;
    }

    const messageText = chatInput.value.trim();

    if (!messageText) {
        return;
    }

    try {

        await addDoc(

            collection(
                db,
                "liveStreams",
                streamId,
                "messages"
            ),

            {

                userId: currentUser.uid,

                username:
                    currentUser.displayName ||
                    currentUser.email ||
                    "AlQlic User",

                photoURL: currentUser.photoURL || "",

                text: messageText,

                createdAt: serverTimestamp()

            }

        );

        chatInput.value = "";

    } catch (error) {

        console.error("Send chat error:", error);

        alert("Unable to send message.");

    }

}


// =====================================================
// LIKE BUTTON — SYNCHRONIZED WITH HOST
// =====================================================

if (likeBtn) {

    likeBtn.addEventListener("click", async () => {

        if (!currentUser || streamEnded) {
            return;
        }

        try {

            // INCREASE TOTAL LIVE LIKES

            await updateDoc(

                doc(
                    db,
                    "liveStreams",
                    streamId
                ),

                {
                    likes: increment(1)
                }

            );


            // CREATE A HEART EVENT FOR HOST AND VIEWERS

            await addDoc(

                collection(
                    db,
                    "liveStreams",
                    streamId,
                    "likeEvents"
                ),

                {

                    userId: currentUser.uid,

                    emoji: "❤️",

                    createdAt: serverTimestamp()

                }

            );

        } catch (error) {

            console.error("Like error:", error);

            alert("Unable to like this live stream.");

        }

    });

}


// =====================================================
// LISTEN FOR LIVE HEART EVENTS
// =====================================================

function listenForLikeEvents() {

    const likeEventsRef = collection(
        db,
        "liveStreams",
        streamId,
        "likeEvents"
    );

    let firstSnapshot = true;

    unsubscribeLikeEvents = onSnapshot(

        likeEventsRef,

        snapshot => {

            // DO NOT REPLAY OLD HEARTS WHEN JOINING

            if (firstSnapshot) {

                firstSnapshot = false;

                return;

            }

            snapshot.docChanges().forEach(change => {

                if (change.type !== "added") {
                    return;
                }

                const eventData = change.doc.data();

                showFloatingHeart(
                    eventData.emoji || "❤️"
                );

            });

        },

        error => {

            console.error("Like events listener error:", error);

        }

    );

}


// =====================================================
// FLOATING HEART ANIMATION
// =====================================================

function showFloatingHeart(emoji = "❤️") {

    if (!liveLikesOverlay) {
        return;
    }

    const heart = document.createElement("span");

    heart.className = "floating-live-heart";

    heart.textContent = emoji;

    heart.style.right =
        Math.floor(Math.random() * 55) + "px";

    liveLikesOverlay.appendChild(heart);

    setTimeout(() => {

        heart.remove();

    }, 2500);

}


// =====================================================
// SEND GIFT
// =====================================================

if (giftBtn) {

    giftBtn.addEventListener("click", () => {

        if (!creatorId) {

            alert("Creator information is unavailable.");

            return;

        }

        const giftURL =
            `gifts.html?creatorId=${encodeURIComponent(creatorId)}` +
            `&streamId=${encodeURIComponent(streamId)}`;

        window.location.href = giftURL;

    });

}


// =====================================================
// SHARE LIVE STREAM
// =====================================================

if (shareBtn) {

    shareBtn.addEventListener("click", async () => {

        const shareURL = window.location.href;

        try {

            if (navigator.share) {

                await navigator.share({

                    title: title?.textContent || "AlQlic Live",

                    text: "Watch this live stream on AlQlic!",

                    url: shareURL

                });

            } else {

                await navigator.clipboard.writeText(shareURL);

                alert("Live stream link copied!");

            }

        } catch (error) {

            console.log("Share cancelled or unavailable.");

        }

    });

}


// =====================================================
// ESCAPE HTML
// =====================================================

function escapeHTML(value = "") {

    return String(value)

        .replaceAll("&", "&amp;")

        .replaceAll("<", "&lt;")

        .replaceAll(">", "&gt;")

        .replaceAll('"', "&quot;")

        .replaceAll("'", "&#039;");

}


// =====================================================
// CLEANUP VIEWER
// =====================================================

async function cleanupViewer() {

    if (cleanupStarted) {
        return;
    }

    cleanupStarted = true;

    console.log("Cleaning up viewer connection...");


    // STOP FIRESTORE LISTENERS

    if (unsubscribeAnswer) {

        unsubscribeAnswer();

        unsubscribeAnswer = null;

    }

    if (unsubscribeHostCandidates) {

        unsubscribeHostCandidates();

        unsubscribeHostCandidates = null;

    }

    if (unsubscribeChat) {

        unsubscribeChat();

        unsubscribeChat = null;

    }

    if (unsubscribeStreamStats) {

        unsubscribeStreamStats();

        unsubscribeStreamStats = null;

    }

    if (unsubscribeLikeEvents) {

        unsubscribeLikeEvents();

        unsubscribeLikeEvents = null;

    }


    // CLOSE WEBRTC CONNECTION

    if (peerConnection) {

        try {

            peerConnection.ontrack = null;

            peerConnection.onicecandidate = null;

            peerConnection.onconnectionstatechange = null;

            peerConnection.close();

        } catch (error) {

            console.error("Connection cleanup error:", error);

        }

        peerConnection = null;

    }


    // REMOVE VIEWER DOCUMENTS

    const cleanupTasks = [];

    if (viewerAnswerRef) {

        cleanupTasks.push(
            deleteDoc(viewerAnswerRef)
        );

    }

    if (viewerOfferRef) {

        cleanupTasks.push(
            deleteDoc(viewerOfferRef)
        );

    }

    const results = await Promise.allSettled(cleanupTasks);

    results.forEach(result => {

        if (result.status === "rejected") {

            console.error(
                "Firestore cleanup error:",
                result.reason
            );

        }

    });

    console.log("Viewer cleanup completed");

}


// =====================================================
// PAGE CLEANUP
// =====================================================

window.addEventListener("pagehide", () => {

    cleanupViewer();

});

window.addEventListener("beforeunload", () => {

    cleanupViewer();

});
