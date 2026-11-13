
import { auth, db } from "./firebase.js";

import {
    collection,
    query,
    where,
    orderBy,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";


console.log("✅ AlQlic Streaming JS loaded");


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

const toggleStreamSearch = document.getElementById("toggleStreamSearch");
const streamSearchBox = document.getElementById("streamSearchBox");


// ===================================
// SEARCH STATE
// ===================================

let currentSearchText = "";


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
// FILTER LIVE STREAMS AND VIDEOS
// ===================================

function filterStreamResults() {

    if (!streamSearch) return;

    currentSearchText = streamSearch.value
        .trim()
        .toLowerCase();

    const activeLive = liveTab.classList.contains("active");

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
        }

    });


    // LIVE SEARCH EMPTY MESSAGE

    if (activeLive && noLiveStreams) {

        if (cards.length === 0) {

            noLiveStreams.style.display = "block";
            noLiveStreams.textContent = "Nobody is live right now.";

        } else if (visibleCount === 0) {

            noLiveStreams.style.display = "block";
            noLiveStreams.textContent = "No matching live streamers found.";

        } else {

            noLiveStreams.style.display = "none";

        }

    }


    // VIDEO SEARCH EMPTY MESSAGE

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

}


// ===================================
// OPEN AND CLOSE HEADER SEARCH
// ===================================

if (toggleStreamSearch && streamSearchBox) {

    toggleStreamSearch.addEventListener("click", () => {

        const isHidden =
            streamSearchBox.style.display === "none";

        if (isHidden) {

            streamSearchBox.style.display = "flex";

            toggleStreamSearch.setAttribute(
                "aria-label",
                "Close search"
            );

            streamSearch.focus();

        } else {

            streamSearchBox.style.display = "none";

            streamSearch.value = "";

            toggleStreamSearch.setAttribute(
                "aria-label",
                "Open search"
            );

            filterStreamResults();

        }

    });

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

        filterStreamResults();

    });

}


// ===================================
// LOAD LIVE STREAMS FROM FIRESTORE
// ===================================

const streamsQuery = query(

    collection(db, "liveStreams"),

    where("status", "==", "live")

);


onSnapshot(

    streamsQuery,

    (snapshot) => {

        liveStreams.innerHTML = "";


        // NOBODY IS LIVE

        if (snapshot.empty) {

            noLiveStreams.style.display = "block";

            noLiveStreams.textContent =
                "Nobody is live right now.";

            return;

        }


        noLiveStreams.style.display = "none";


        // DISPLAY LIVE STREAMS

        snapshot.forEach((docSnap) => {

            const stream = docSnap.data();

            const streamId = docSnap.id;


            // HOST PHOTO

            const hostPhoto =
                stream.hostPhoto ||
                "default-profile.png";


            // HOST NAME

            const hostName =
                stream.hostName ||
                "MatchConnect User";


            // HOST USERNAME

            const hostUsername =
                stream.hostUsername ||
                "";


            // STREAM TITLE

            const streamTitle =
                stream.title ||
                "Live Stream";


            // VIEWER COUNT

            const viewers =
                stream.viewerCount || 0;


            // CREATE CARD

            const card = document.createElement("div");

            card.className = "live-card";


            // SEARCHABLE INFORMATION

            card.dataset.searchText = [

                hostName,

                hostUsername,

                streamTitle

            ].join(" ").toLowerCase();


            // CARD CONTENT

            card.innerHTML = `

                <div class="live-preview">

                    <img
                        src="${escapeHTML(hostPhoto)}"
                        alt="${escapeHTML(hostName)}"
                        onerror="this.src='default-profile.png'"
                    >

                    <span class="live-badge">
                        🔴 LIVE
                    </span>

                    <span class="viewer-count">

                        <i class="fa-solid fa-eye"></i>

                        ${Number(viewers) || 0}

                    </span>

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


            // OPEN LIVE STREAM

            card.addEventListener("click", () => {

                window.location.href =
                    `watch-live.html?streamId=${encodeURIComponent(streamId)}`;

            });


            // ADD CARD

            liveStreams.appendChild(card);

        });


        // APPLY SEARCH AFTER FIREBASE UPDATE

        filterStreamResults();

    },


    (error) => {

        console.error(
            "❌ Error loading live streams:",
            error
        );

        noLiveStreams.style.display = "block";

        noLiveStreams.textContent =
            "Unable to load live streams.";

    }

);


// ===================================
// LOAD SAVED LIVE VIDEOS
// ===================================

const savedVideosQuery = query(

    collection(db, "liveStreams"),

    where("status", "==", "ended"),

    where("videoSaved", "==", true),

    orderBy("endedAt", "desc")

);


onSnapshot(

    savedVideosQuery,

    (snapshot) => {

        videoFeed.innerHTML = "";


        // NO SAVED VIDEOS

        if (snapshot.empty) {

            videoFeed.innerHTML = `

                <p class="empty-message">

                    No saved live videos yet.

                </p>

            `;

            return;

        }


        // DISPLAY SAVED VIDEOS

        snapshot.forEach((docSnap) => {

            const stream = docSnap.data();

            const streamId = docSnap.id;


            // VIDEO TITLE

            const title =
                stream.title ||
                "Live Stream";


            // HOST NAME

            const hostName =
                stream.hostName ||
                "MatchConnect User";


            // HOST USERNAME

            const hostUsername =
                stream.hostUsername ||
                "";


            // HOST PHOTO

            const hostPhoto =
                stream.hostPhoto ||
                "default-profile.png";


            // CREATE VIDEO CARD

            const card = document.createElement("div");

            card.className = "video-card";


            // SEARCHABLE INFORMATION

            card.dataset.searchText = [

                title,

                hostName,

                hostUsername

            ].join(" ").toLowerCase();


            // VIDEO CARD CONTENT

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


            // OPEN SAVED VIDEO

            card.addEventListener("click", () => {

                window.location.href =
                    `watch-live.html?streamId=${encodeURIComponent(streamId)}&recorded=true`;

            });


            // ADD VIDEO CARD

            videoFeed.appendChild(card);

        });


        // APPLY SEARCH AFTER FIREBASE UPDATE

        filterStreamResults();

    },


    (error) => {

        console.error(
            "❌ Error loading saved live videos:",
            error
        );

        videoFeed.innerHTML = `

            <p class="empty-message">

                Unable to load saved videos.

            </p>

        `;

    }

);
