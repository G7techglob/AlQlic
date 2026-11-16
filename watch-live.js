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
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";


console.log("✅ Watch Live JS loaded");


// =====================================================
// GET STREAM ID
// =====================================================

const params =
    new URLSearchParams(
        window.location.search
    );

const streamId =
    params.get("streamId");


// =====================================================
// ELEMENTS
// =====================================================

const remoteVideo =
    document.getElementById("remoteVideo");

const title =
    document.getElementById("title");

const streamTitle =
    document.getElementById("streamTitle");

const viewerCount =
    document.getElementById("viewerCount");

const hostInfo =
    document.getElementById("hostInfo");

const chatMessages =
    document.getElementById("chatMessages");

const chatInput =
    document.getElementById("chatInput");

const sendChatBtn =
    document.getElementById("sendChatBtn");

const likeBtn =
    document.getElementById("likeBtn");

const giftBtn =
    document.getElementById("giftBtn");

const shareBtn =
    document.getElementById("shareBtn");


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


// =====================================================
// WEBRTC CONFIGURATION
// =====================================================

const rtcConfig = {

    iceServers: [

        {
            urls:
                "stun:stun.l.google.com:19302"
        },

        {
            urls:
                "stun:stun1.l.google.com:19302"
        }

    ]

};


// =====================================================
// CHECK STREAM ID
// =====================================================

if (!streamId) {

    alert(
        "Live stream not found."
    );

    window.location.href =
        "stream.html";

}


// =====================================================
// AUTH
// =====================================================

auth.onAuthStateChanged(
    async user => {

        if (!user) {

            alert(
                "Please log in to watch this live stream."
            );

            window.location.href =
                "login.html";

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

        } catch (error) {

            console.error(
                "Watch Live startup error:",
                error
            );

        }

    }
);


// =====================================================
// LOAD STREAM
// =====================================================

async function loadStream() {

    const streamRef =
        doc(
            db,
            "liveStreams",
            streamId
        );


    const streamSnap =
        await getDoc(
            streamRef
        );


    if (!streamSnap.exists()) {

        alert(
            "This live stream does not exist."
        );

        window.location.href =
            "stream.html";

        streamEnded = true;

        return;

    }


    const stream =
        streamSnap.data();


    creatorId =
        stream.hostId || null;


    if (
        stream.status !== "live"
    ) {

        alert(
            "This live stream has ended."
        );

        streamEnded = true;

        return;

    }


    const streamName =
        stream.title ||
        "AlQlic Live";


    if (title) {

        title.textContent =
            streamName;

    }


    if (streamTitle) {

        streamTitle.textContent =
            streamName;

    }


    if (viewerCount) {

        viewerCount.textContent =
            stream.viewerCount || 0;

    }


    if (hostInfo) {

        hostInfo.textContent =
            stream.hostName ||
            "AlQlic User";

    }


    const likes =
        stream.likes || 0;


    if (likeBtn) {

        likeBtn.innerHTML =
            `❤️ <span>${likes}</span>`;

    }

}


// =====================================================
// JOIN LIVE
// =====================================================


async function joinLive() {

    if (streamEnded) {
        return;
    }

    console.log("📡 Joining live stream...");

    peerConnection = new RTCPeerConnection(rtcConfig);

    // Store host candidates that arrive before the answer.
    let pendingHostCandidates = [];

    let remoteDescriptionReady = false;

    let answerApplied = false;


    // =================================================
    // RECEIVE HOST MEDIA
    // =================================================

    peerConnection.ontrack = event => {

        console.log("🎥 Host media received");

        if (
            event.streams &&
            event.streams[0] &&
            remoteVideo
        ) {

            remoteVideo.srcObject = event.streams[0];

            remoteVideo.play().catch(error => {

                console.log(
                    "Video play waiting for user interaction:",
                    error
                );

            });

        }

    };


    // =================================================
    // VIEWER ICE CANDIDATES
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

            console.error(
                "Viewer ICE error:",
                error
            );

        }

    };


    // =================================================
    // CONNECTION STATE
    // =================================================

    peerConnection.onconnectionstatechange = () => {

        if (!peerConnection) {
            return;
        }

        console.log(
            "WebRTC connection:",
            peerConnection.connectionState
        );

        if (
            peerConnection.connectionState === "failed"
        ) {

            console.error(
                "WebRTC connection failed."
            );

        }

    };


    // =================================================
    // CREATE OFFER
    // =================================================

    const offer = await peerConnection.createOffer({

        offerToReceiveAudio: true,

        offerToReceiveVideo: true

    });


    await peerConnection.setLocalDescription(offer);


    // =================================================
    // SAVE OFFER
    // =================================================

    viewerOfferRef = doc(
        db,
        "liveStreams",
        streamId,
        "offers",
        viewerId
    );


    await setDoc(
        viewerOfferRef,
        {

            type: offer.type,

            sdp: offer.sdp,

            viewerId: viewerId,

            createdAt: serverTimestamp()

        }
    );


    console.log("📤 Viewer offer sent");


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
    // RECEIVE HOST ICE CANDIDATES
    // =================================================

    const hostCandidatesRef = collection(
        db,
        "liveStreams",
        streamId,
        "viewers",
        viewerId,
        "hostCandidates"
    );


    onSnapshot(
        hostCandidatesRef,
        async snapshot => {

            for (const change of snapshot.docChanges()) {

                if (change.type !== "added") {
                    continue;
                }

                const candidateData = change.doc.data();

                try {

                    if (
                        !peerConnection ||
                        !candidateData
                    ) {
                        continue;
                    }


                    // If the host answer is not ready,
                    // save this candidate temporarily.

                    if (!remoteDescriptionReady) {

                        pendingHostCandidates.push(
                            candidateData
                        );

                        continue;

                    }


                    await peerConnection.addIceCandidate(
                        new RTCIceCandidate(candidateData)
                    );


                    console.log(
                        "✅ Host ICE candidate added"
                    );


                } catch (error) {

                    console.error(
                        "Host ICE error:",
                        error
                    );

                }

            }

        },
        error => {

            console.error(
                "Host ICE listener error:",
                error
            );

        }
    );


    // =================================================
    // RECEIVE HOST ANSWER
    // =================================================

    onSnapshot(
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

                    new RTCSessionDescription(
                        data.answer
                    )

                );


                remoteDescriptionReady = true;


                console.log(
                    "📥 Host answer received"
                );


                // Add all host candidates that arrived early.

                for (
                    const candidateData of pendingHostCandidates
                ) {

                    try {

                        await peerConnection.addIceCandidate(

                            new RTCIceCandidate(
                                candidateData
                            )

                        );

                    } catch (error) {

                        console.error(
                            "Pending host ICE error:",
                            error
                        );

                    }

                }


                pendingHostCandidates = [];


                console.log(
                    "✅ Pending host ICE candidates processed"
                );


            } catch (error) {

                answerApplied = false;

                console.error(
                    "Remote description error:",
                    error
                );

            }

        },
        error => {

            console.error(
                "Host answer listener error:",
                error
            );

        }
    );

}


    // =================================================
    // RECEIVE HOST MEDIA
    // =================================================

    peerConnection.ontrack =
        event => {

            console.log(
                "🎥 Host media received"
            );


            if (
                event.streams &&
                event.streams[0] &&
                remoteVideo
            ) {

                remoteVideo.srcObject =
                    event.streams[0];


                remoteVideo.play()
                    .catch(
                        error => {

                            console.log(
                                "Video play waiting for user interaction:",
                                error
                            );

                        }
                    );

            }

        };


    // =================================================
    // VIEWER ICE CANDIDATES
    // =================================================

    peerConnection.onicecandidate =
        async event => {

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

                console.error(
                    "Viewer ICE error:",
                    error
                );

            }

        };


    // =================================================
    // CONNECTION STATE
    // =================================================

    peerConnection.onconnectionstatechange =
        () => {

            if (!peerConnection) {
                return;
            }


            console.log(
                "WebRTC connection:",
                peerConnection.connectionState
            );


            if (
                peerConnection.connectionState ===
                "failed"
            ) {

                console.error(
                    "WebRTC connection failed."
                );

            }

        };


    // =================================================
    // CREATE OFFER
    // =================================================

    const offer =
        await peerConnection.createOffer({

            offerToReceiveAudio:
                true,

            offerToReceiveVideo:
                true

        });


    await peerConnection.setLocalDescription(
        offer
    );


    // =================================================
    // SAVE OFFER
    // =================================================

    viewerOfferRef =
        doc(
            db,
            "liveStreams",
            streamId,
            "offers",
            viewerId
        );


    await setDoc(
        viewerOfferRef,
        {

            type:
                offer.type,

            sdp:
                offer.sdp,

            viewerId:
                viewerId,

            createdAt:
                serverTimestamp()

        }
    );


    console.log(
        "📤 Viewer offer sent"
    );


    // =================================================
    // VIEWER ANSWER DOCUMENT
    // =================================================

    viewerAnswerRef =
        doc(
            db,
            "liveStreams",
            streamId,
            "viewers",
            viewerId
        );


    // =================================================
    // LISTEN FOR HOST ANSWER
    // =================================================

    onSnapshot(
        viewerAnswerRef,
        async snapshot => {

            if (!snapshot.exists()) {
                return;
            }


            const data =
                snapshot.data();


            if (!data.answer) {
                return;
            }


            if (
                peerConnection &&
                peerConnection.currentRemoteDescription
            ) {

                return;

            }


            try {

                if (!peerConnection) {
                    return;
                }


                await peerConnection
                    .setRemoteDescription(
                        new RTCSessionDescription(
                            data.answer
                        )
                    );


                console.log(
                    "📥 Host answer received"
                );


            } catch (error) {

                console.error(
                    "Remote description error:",
                    error
                );

            }

        }
    );


    // =================================================
    // RECEIVE HOST ICE CANDIDATES
    // =================================================

    const hostCandidatesRef =
        collection(
            db,
            "liveStreams",
            streamId,
            "viewers",
            viewerId,
            "hostCandidates"
        );


    onSnapshot(
        hostCandidatesRef,
        async snapshot => {

            for (
                const change of snapshot.docChanges()
            ) {

                if (
                    change.type !== "added"
                ) {
                    continue;
                }


                try {

                    if (
                        peerConnection &&
                        peerConnection.remoteDescription
                    ) {

                        await peerConnection
                            .addIceCandidate(
                                new RTCIceCandidate(
                                    change.doc.data()
                                )
                            );

                    }

                } catch (error) {

                    console.error(
                        "Host ICE error:",
                        error
                    );

                }

            }

        }
    );

}


// =====================================================
// LIVE CHAT
// =====================================================

function listenForChat() {

    const commentsRef =
        collection(
            db,
            "liveStreams",
            streamId,
            "messages"
        );


    onSnapshot(
        commentsRef,
        snapshot => {

            if (!chatMessages) {
                return;
            }


            const messages = [];


            snapshot.forEach(
                commentDoc => {

                    messages.push(
                        commentDoc.data()
                    );

                }
            );


            messages.sort(
                (a, b) => {

                    const timeA =
                        a.createdAt
                            ?.toMillis?.() || 0;

                    const timeB =
                        b.createdAt
                            ?.toMillis?.() || 0;

                    return timeA - timeB;

                }
            );


            chatMessages.innerHTML = "";


            messages.forEach(
                comment => {

                    const message =
                        document.createElement(
                            "div"
                        );


                    message.className =
                        "chat-message";


                    const username =
                        escapeHTML(
                            comment.username ||
                            "User"
                        );


                    const text =
                        escapeHTML(
                            comment.text ||
                            ""
                        );


                    message.innerHTML = `

                        <strong>
                            ${username}
                        </strong>

                        <span>
                            ${text}
                        </span>

                    `;


                    chatMessages.appendChild(
                        message
                    );

                }
            );


            chatMessages.scrollTop =
                chatMessages.scrollHeight;

        },
        error => {

            console.error(
                "Live chat error:",
                error
            );

        }
    );

}


// =====================================================
// SEND CHAT
// =====================================================

if (sendChatBtn) {

    sendChatBtn.addEventListener(
        "click",
        sendChat
    );

}


if (chatInput) {

    chatInput.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Enter" &&
                !event.shiftKey
            ) {

                event.preventDefault();

                sendChat();

            }

        }
    );

}


async function sendChat() {

    if (!chatInput || !currentUser) {
        return;
    }


    const text =
        chatInput.value.trim();


    if (!text) {
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

                userId:
                    currentUser.uid,

                username:
                    currentUser.displayName ||
                    currentUser.email ||
                    "AlQlic User",

                photoURL:
                    currentUser.photoURL ||
                    "",

                text:
                    text,

                createdAt:
                    serverTimestamp()

            }

        );


        chatInput.value = "";


    } catch (error) {

        console.error(
            "Send chat error:",
            error
        );


        alert(
            "Unable to send message."
        );

    }

}


// =====================================================
// LIKE
// =====================================================

if (likeBtn) {

    likeBtn.addEventListener(
        "click",
        async () => {

            if (!currentUser) {
                return;
            }


            try {

                await updateDoc(

                    doc(
                        db,
                        "liveStreams",
                        streamId
                    ),

                    {

                        likes:
                            increment(1)

                    }

                );


                likeBtn.disabled = true;

                likeBtn.innerHTML =
                    "❤️ Liked";


            } catch (error) {

                console.error(
                    "Like error:",
                    error
                );

            }

        }
    );

}


// =====================================================
// SEND GIFT
// =====================================================

if (giftBtn) {

    giftBtn.addEventListener(
        "click",
        () => {

            if (!creatorId) {

                alert(
                    "Creator information is unavailable."
                );

                return;

            }


            const giftURL =
                `gifts.html?creatorId=${encodeURIComponent(
                    creatorId
                )}&streamId=${encodeURIComponent(
                    streamId
                )}`;


            window.location.href =
                giftURL;

        }
    );

}


// =====================================================
// SHARE
// =====================================================

if (shareBtn) {

    shareBtn.addEventListener(
        "click",
        async () => {

            const shareURL =
                window.location.href;


            try {

                if (navigator.share) {

                    await navigator.share({

                        title:
                            title?.textContent ||
                            "AlQlic Live",

                        text:
                            "Watch this live stream on AlQlic!",

                        url:
                            shareURL

                    });

                } else {

                    await navigator.clipboard.writeText(
                        shareURL
                    );


                    alert(
                        "Live stream link copied!"
                    );

                }

            } catch (error) {

                console.log(
                    "Share cancelled."
                );

            }

        }
    );

}


// =====================================================
// ESCAPE HTML
// =====================================================

function escapeHTML(
    value = ""
) {

    return String(value)

        .replaceAll(
            "&",
            "&amp;"
        )

        .replaceAll(
            "<",
            "&lt;"
        )

        .replaceAll(
            ">",
            "&gt;"
        )

        .replaceAll(
            '"',
            "&quot;"
        )

        .replaceAll(
            "'",
            "&#039;"
        );

}


// =====================================================
// CLEANUP VIEWER
// =====================================================

function cleanupViewer() {

    if (cleanupStarted) {
        return;
    }


    cleanupStarted = true;


    if (peerConnection) {

        try {

            peerConnection.close();

        } catch (error) {

            console.error(
                "Connection cleanup error:",
                error
            );

        }


        peerConnection = null;

    }


    if (viewerAnswerRef) {

        deleteDoc(viewerAnswerRef)
            .catch(error => {

                console.error(
                    "Viewer document cleanup error:",
                    error
                );

            });

    }


    if (viewerOfferRef) {

        deleteDoc(viewerOfferRef)
            .catch(error => {

                console.error(
                    "Viewer offer cleanup error:",
                    error
                );

            });

    }

}


// =====================================================
// PAGE CLEANUP
// =====================================================

window.addEventListener(
    "beforeunload",
    cleanupViewer
);


window.addEventListener(
    "pagehide",
    cleanupViewer
);
