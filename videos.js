import { db } from "./firebase.js";
import {
    collection,
    query,
    orderBy,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const videoFeed = document.getElementById("videoFeed");

const q = query(
    collection(db, "posts"),
    orderBy("createdAt", "desc")
);

onSnapshot(q, (snapshot) => {

    videoFeed.innerHTML = "";

    snapshot.forEach(doc => {

        const post = doc.data();

        if (!post.media) return;

        const video = post.media.find(
            item => item.type === "video"
        );

        if (!video) return;

        const div = document.createElement("div");

        div.className = "video-post";

        div.innerHTML = `
            <video controls src="${video.url}"></video>

            <p>${post.content || ""}</p>
        `;

        videoFeed.appendChild(div);

    });

});


/* =====================================
   VIDEO SEARCH FUNCTIONALITY
===================================== */

const videoSearchBtn = document.getElementById("videoSearchBtn");
const closeVideoSearch = document.getElementById("closeVideoSearch");
const videoSearchBox = document.getElementById("videoSearchBox");
const videoSearchInput = document.getElementById("videoSearchInput");
const videoTitle = document.getElementById("videoTitle");
const videoFeed = document.getElementById("videoFeed");

// Open search
videoSearchBtn.addEventListener("click", () => {

    videoSearchBox.classList.add("active");

    videoSearchBtn.style.display = "none";
    closeVideoSearch.style.display = "block";

    videoTitle.style.display = "none";

    videoSearchInput.focus();

});

// Search videos
videoSearchInput.addEventListener("input", () => {

    const searchText = videoSearchInput.value.toLowerCase().trim();

    const videoCards = videoFeed.children;

    Array.from(videoCards).forEach(card => {

        const videoText = card.textContent.toLowerCase();

        card.style.display = videoText.includes(searchText)
            ? ""
            : "none";

    });

});

// Close search
closeVideoSearch.addEventListener("click", () => {

    videoSearchInput.value = "";

    videoSearchBox.classList.remove("active");

    videoSearchBtn.style.display = "block";
    closeVideoSearch.style.display = "none";

    videoTitle.style.display = "";

    Array.from(videoFeed.children).forEach(card => {
        card.style.display = "";
    });

});
