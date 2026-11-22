
import { auth, db } from "./firebase.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    collection,
    addDoc,
    onSnapshot,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    increment,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// =====================================================
// ALQLIC LIVE — VIEWER
// Host video + co-host video + chat + likes + gifts
// =====================================================

const params = new URLSearchParams(window.location.search);
const streamId = params.get("streamId");

const $ = id => document.getElementById(id);

const remoteVideo = $("remoteVideo");
const coHostVideo = $("coHostVideo");

const titleElement = $("title");
const streamTitleElement = $("streamTitle");
const viewerCountElement = $("viewerCount");
const hostInfo = $("hostInfo");

const chatMessages = $("chatMessages");
const chatInput = $("chatInput");
const sendChatBtn = $("sendChatBtn");

const likeBtn = $("likeBtn");
const likeCountElement = $("likeCount");

const giftBtn = $("giftBtn");
const shareBtn = $("shareBtn");
const backBtn = $("backBtn");

const rtcConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};

let currentUser = null;
let streamData = null;

let viewerSessionId = null;

let hostPeerConnection = null;
let coHostPeerConnection = null;

let hostAnswerListener = null;
let hostCandidatesListener = null;

let coHostAnswerListener = null;
let coHostCandidatesListener = null;
let coHostInvitationListener = null;

let chatListener = null;
let streamListener = null;
let viewerCountListener = null;

let currentCoHostInvitationId = null;
let currentCoHostViewerRef = null;

let isLeaving = false;

function setText(element, value) {
    if (element) element.textContent = value;
}

function closePeerConnection(pc) {
    if (!pc) return;

    try {
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.onconnectionstatechange = null;
        pc.close();
    } catch (_) {}
}

function makeSessionId(user) {
    return `${user.uid}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// =====================================================
// AUTHENTICATION AND STREAM LOAD
// =====================================================

onAuthStateChanged(auth, async user => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    if (!streamId) {
        alert("Live stream ID is missing.");
        window.location.href = "index.html";
        return;
    }

    currentUser = user;
    viewerSessionId = makeSessionId(user);

    try {
        await loadLiveStream();
        await createHostConnection();
        listenForStreamUpdates();
        listenForViewerCount();
        listenForChatMessages();
        listenForCoHostInvitation();

    } catch (error) {
        console.error("Unable to join live stream:", error);
        alert("Unable to join this live stream. Please try again.");
        await leaveLiveStream();
    }
});

async function loadLiveStream() {
    const streamRef = doc(db, "liveStreams", streamId);
    const snapshot = await getDoc(streamRef);

    if (!snapshot.exists()) {
        throw new Error("Live stream not found.");
    }

    streamData = snapshot.data();

    if (streamData.status !== "live") {
        throw new Error("This live stream has ended.");
    }

    const title = streamData.title || "Live stream";

    setText(titleElement, title);
    setText(streamTitleElement, title);

    if (hostInfo) {
        hostInfo.textContent =
            streamData.hostName ||
            streamData.hostUsername ||
            "Live host";
    }

    setText(likeCountElement, streamData.likes || 0);

    await setDoc(
        doc(db, "liveStreams", streamId, "viewers", viewerSessionId),
        {
            userId: currentUser.uid,
            username: currentUser.displayName || "",
            status: "connecting",
            joinedAt: serverTimestamp()
        },
        { merge: true }
    );
}

// =====================================================
// VIEWER → HOST WEBRTC CONNECTION
// =====================================================

async function createHostConnection() {
    hostPeerConnection = new RTCPeerConnection(rtcConfig);

    hostPeerConnection.ontrack = event => {
        if (!remoteVideo) return;

        if (!remoteVideo.srcObject) {
            remoteVideo.srcObject = new MediaStream();
        }

        const stream = remoteVideo.srcObject;

        if (!stream.getTracks().some(track => track.id === event.track.id)) {
            stream.addTrack(event.track);
        }

        remoteVideo.playsInline = true;
        remoteVideo.autoplay = true;
        remoteVideo.play().catch(() => {});
    };

    hostPeerConnection.onicecandidate = async event => {
        if (!event.candidate) return;

        try {
            await addDoc(
                collection(
                    db,
                    "liveStreams",
                    streamId,
                    "viewers",
                    viewerSessionId,
                    "viewerCandidates"
                ),
                event.candidate.toJSON()
            );
        } catch (error) {
            console.error("Viewer ICE write failed:", error);
        }
    };

    hostPeerConnection.onconnectionstatechange = async () => {
        const state = hostPeerConnection?.connectionState;

        console.log("Host connection state:", state);

        if (state === "connected") {
            try {
                await updateDoc(
                    doc(db, "liveStreams", streamId, "viewers", viewerSessionId),
                    {
                        status: "connected",
                        connectedAt: serverTimestamp()
                    }
                );
            } catch (error) {
                console.warn("Viewer connected status update failed:", error);
            }
        }

        if (state === "failed") {
            console.warn("Host video connection failed.");
        }
    };

    const offer = await hostPeerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
    });

    await hostPeerConnection.setLocalDescription(offer);

    const offerRef = doc(
        db,
        "liveStreams",
        streamId,
        "offers",
        viewerSessionId
    );

    await setDoc(offerRef, {
        offer: hostPeerConnection.localDescription.toJSON(),
        viewerId: currentUser.uid,
        createdAt: serverTimestamp()
    });

    listenForHostAnswer();
    listenForHostCandidates();
}

// =====================================================
// RECEIVE HOST ANSWER
// =====================================================

function listenForHostAnswer() {
    const viewerRef = doc(
        db,
        "liveStreams",
        streamId,
        "viewers",
        viewerSessionId
    );

    hostAnswerListener = onSnapshot(viewerRef, async snapshot => {
        if (!snapshot.exists() || !hostPeerConnection) return;

        const data = snapshot.data();

        if (
            data.answer &&
            !hostPeerConnection.currentRemoteDescription
        ) {
            try {
                await hostPeerConnection.setRemoteDescription(
                    new RTCSessionDescription(data.answer)
                );

                console.log("Host answer applied.");
            } catch (error) {
                console.error("Applying host answer failed:", error);
            }
        }
    });
}

// =====================================================
// RECEIVE HOST ICE CANDIDATES
// =====================================================

function listenForHostCandidates() {
    const candidatesRef = collection(
        db,
        "liveStreams",
        streamId,
        "viewers",
        viewerSessionId,
        "hostCandidates"
    );

    hostCandidatesListener = onSnapshot(candidatesRef, async snapshot => {
        if (!hostPeerConnection?.remoteDescription) return;

        for (const change of snapshot.docChanges()) {
            if (change.type !== "added") continue;

            try {
                await hostPeerConnection.addIceCandidate(
                    new RTCIceCandidate(change.doc.data())
                );
            } catch (error) {
                console.warn("Host ICE candidate error:", error);
            }
        }
    });
}

// =====================================================
// FIND ACCEPTED CO-HOST AND CONNECT TO CO-HOST MEDIA
// =====================================================

function listenForCoHostInvitation() {
    const invitationsRef = collection(
        db,
        "liveStreams",
        streamId,
        "coHostInvitations"
    );

    coHostInvitationListener = onSnapshot(
        query(
            invitationsRef,
            where("status", "==", "accepted"),
            limit(1)
        ),
        snapshot => {
            if (snapshot.empty) {
                if (coHostPeerConnection) {
                    cleanupCoHostViewerConnection();
                }
                return;
            }

            const invitationDoc = snapshot.docs[0];

            if (currentCoHostInvitationId === invitationDoc.id) return;

            if (coHostPeerConnection) {
                cleanupCoHostViewerConnection();
            }

            currentCoHostInvitationId = invitationDoc.id;

            createCoHostViewerConnection(
                invitationDoc.id
            ).catch(error => {
                console.error("Co-host viewer connection failed:", error);
            });
        }
    );
}

// =====================================================
// VIEWER → HOST RELAY FOR CO-HOST MEDIA
// =====================================================

async function createCoHostViewerConnection(invitationId) {
    const invitationRef = doc(
        db,
        "liveStreams",
        streamId,
        "coHostInvitations",
        invitationId
    );

    currentCoHostViewerRef = doc(
        invitationRef,
        "viewers",
        viewerSessionId
    );

    coHostPeerConnection = new RTCPeerConnection(rtcConfig);

    coHostPeerConnection.ontrack = event => {
        if (!coHostVideo) return;

        if (!coHostVideo.srcObject) {
            coHostVideo.srcObject = new MediaStream();
        }

        const stream = coHostVideo.srcObject;

        if (!stream.getTracks().some(track => track.id === event.track.id)) {
            stream.addTrack(event.track);
        }

        coHostVideo.playsInline = true;
        coHostVideo.autoplay = true;
        coHostVideo.play().catch(() => {});
    };

    coHostPeerConnection.onicecandidate = async event => {
        if (!event.candidate || !currentCoHostViewerRef) return;

        try {
            await addDoc(
                collection(currentCoHostViewerRef, "viewerCandidates"),
                event.candidate.toJSON()
            );
        } catch (error) {
            console.error("Co-host viewer ICE write failed:", error);
        }
    };

    coHostPeerConnection.onconnectionstatechange = () => {
        console.log(
            "Co-host viewer connection:",
            coHostPeerConnection?.connectionState
        );
    };

    const offer = await coHostPeerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
    });

    await coHostPeerConnection.setLocalDescription(offer);

    await setDoc(currentCoHostViewerRef, {
        viewerId: currentUser.uid,
        offer: coHostPeerConnection.localDescription.toJSON(),
        status: "connecting",
        createdAt: serverTimestamp()
    }, { merge: true });

    listenForCoHostAnswer();
    listenForCoHostCandidates();
}

// =====================================================
// RECEIVE CO-HOST RELAY ANSWER
// =====================================================

function listenForCoHostAnswer() {
    if (!currentCoHostViewerRef) return;

    coHostAnswerListener = onSnapshot(
        currentCoHostViewerRef,
        async snapshot => {
            if (!snapshot.exists() || !coHostPeerConnection) return;

            const data = snapshot.data();

            if (
                data.answer &&
                !coHostPeerConnection.currentRemoteDescription
            ) {
                try {
                    await coHostPeerConnection.setRemoteDescription(
                        new RTCSessionDescription(data.answer)
                    );

                    console.log("Co-host relay answer applied.");
                } catch (error) {
                    console.error("Applying co-host answer failed:", error);
                }
            }
        }
    );
}

// =====================================================
// RECEIVE CO-HOST RELAY ICE CANDIDATES
// =====================================================

function listenForCoHostCandidates() {
    if (!currentCoHostViewerRef) return;

    const candidatesRef = collection(
        currentCoHostViewerRef,
        "hostCandidates"
    );

    coHostCandidatesListener = onSnapshot(
        candidatesRef,
        async snapshot => {
            if (!coHostPeerConnection?.remoteDescription) return;

            for (const change of snapshot.docChanges()) {
                if (change.type !== "added") continue;

                try {
                    await coHostPeerConnection.addIceCandidate(
                        new RTCIceCandidate(change.doc.data())
                    );
                } catch (error) {
                    console.warn("Co-host relay ICE error:", error);
                }
            }
        }
    );
}

// =====================================================
// STREAM UPDATES
// =====================================================

function listenForStreamUpdates() {
    streamListener = onSnapshot(
        doc(db, "liveStreams", streamId),
        snapshot => {
            if (!snapshot.exists()) return;

            const data = snapshot.data();

            setText(likeCountElement, data.likes || 0);

            if (data.status === "ended") {
                alert("This live stream has ended.");
                leaveLiveStream();
            }
        }
    );
}

// =====================================================
// VIEWER COUNT
// =====================================================

function listenForViewerCount() {
    const viewersRef = collection(
        db,
        "liveStreams",
        streamId,
        "viewers"
    );

    viewerCountListener = onSnapshot(viewersRef, snapshot => {
        const count = snapshot.docs.filter(item => {
            const data = item.data();
            return (
                data.status === "connected" ||
                data.status === "connecting"
            );
        }).length;

        setText(viewerCountElement, count);
    });
}

// =====================================================
// LIVE CHAT
// =====================================================

function listenForChatMessages() {
    const messagesRef = collection(
        db,
        "liveStreams",
        streamId,
        "messages"
    );

    chatListener = onSnapshot(
        query(messagesRef, orderBy("createdAt", "asc"), limit(100)),
        snapshot => {
            if (!chatMessages) return;

            chatMessages.innerHTML = "";

            snapshot.forEach(messageDoc => {
                const data = messageDoc.data();

                const item = document.createElement("div");
                item.className = "live-chat-message";

                const name = document.createElement("strong");
                name.textContent = `${data.username || "User"}: `;

                const message = document.createElement("span");
                message.textContent = data.text || "";

                item.append(name, message);
                chatMessages.appendChild(item);
            });

            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    );
}

async function sendChatMessage() {
    const text = chatInput?.value?.trim();

    if (!text) return;

    try {
        await addDoc(
            collection(db, "liveStreams", streamId, "messages"),
            {
                userId: currentUser.uid,
                username: currentUser.displayName || "Viewer",
                text,
                createdAt: serverTimestamp()
            }
        );

        chatInput.value = "";

    } catch (error) {
        console.error("Sending chat message failed:", error);
    }
}

if (sendChatBtn) {
    sendChatBtn.addEventListener("click", sendChatMessage);
}

if (chatInput) {
    chatInput.addEventListener("keydown", event => {
        if (event.key === "Enter") sendChatMessage();
    });
}

// =====================================================
// LIKES
// =====================================================

if (likeBtn) {
    likeBtn.addEventListener("click", async () => {
        try {
            await updateDoc(doc(db, "liveStreams", streamId), {
                likes: increment(1)
            });
        } catch (error) {
            console.error("Like failed:", error);
        }
    });
}

// =====================================================
// GIFTS
// =====================================================

if (giftBtn) {
    giftBtn.addEventListener("click", async () => {
        try {
            await addDoc(
                collection(db, "liveStreams", streamId, "gifts"),
                {
                    senderId: currentUser.uid,
                    senderName: currentUser.displayName || "Viewer",
                    giftType: "heart",
                    createdAt: serverTimestamp()
                }
            );

            console.log("Gift sent.");

        } catch (error) {
            console.error("Gift sending failed:", error);
            alert("Could not send gift.");
        }
    });
}

// =====================================================
// SHARE LIVE STREAM
// =====================================================

if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
        const shareUrl = window.location.href;

        try {
            if (navigator.share) {
                await navigator.share({
                    title: streamData?.title || "AlQlic Live",
                    text: "Watch this live stream on AlQlic",
                    url: shareUrl
                });
            } else if (navigator.clipboard) {
                await navigator.clipboard.writeText(shareUrl);
                alert("Live link copied.");
            } else {
                prompt("Copy this live link:", shareUrl);
            }
        } catch (error) {
            console.warn("Share cancelled or failed:", error);
        }
    });
}

// =====================================================
// CLEANUP CO-HOST VIEWER CONNECTION
// =====================================================

function cleanupCoHostViewerConnection() {
    if (coHostAnswerListener) {
        coHostAnswerListener();
        coHostAnswerListener = null;
    }

    if (coHostCandidatesListener) {
        coHostCandidatesListener();
        coHostCandidatesListener = null;
    }

    closePeerConnection(coHostPeerConnection);
    coHostPeerConnection = null;

    if (coHostVideo) {
        if (coHostVideo.srcObject) {
            coHostVideo.srcObject.getTracks().forEach(track => track.stop());
        }
        coHostVideo.srcObject = null;
    }

    if (currentCoHostViewerRef) {
        deleteDoc(currentCoHostViewerRef).catch(error => {
            console.warn("Co-host viewer document cleanup failed:", error);
        });
    }

    currentCoHostViewerRef = null;
    currentCoHostInvitationId = null;
}

// =====================================================
// LEAVE LIVE STREAM
// =====================================================

async function leaveLiveStream() {
    if (isLeaving) return;
    isLeaving = true;

    if (hostAnswerListener) hostAnswerListener();
    if (hostCandidatesListener) hostCandidatesListener();
    if (coHostInvitationListener) coHostInvitationListener();
    if (chatListener) chatListener();
    if (streamListener) streamListener();
    if (viewerCountListener) viewerCountListener();

    hostAnswerListener = null;
    hostCandidatesListener = null;
    coHostInvitationListener = null;
    chatListener = null;
    streamListener = null;
    viewerCountListener = null;

    closePeerConnection(hostPeerConnection);
    hostPeerConnection = null;

    cleanupCoHostViewerConnection();

    try {
        if (currentUser && streamId && viewerSessionId) {
            await updateDoc(
                doc(db, "liveStreams", streamId, "viewers", viewerSessionId),
                {
                    status: "disconnected",
                    leftAt: serverTimestamp()
                }
            );

            await deleteDoc(
                doc(db, "liveStreams", streamId, "offers", viewerSessionId)
            );
        }
    } catch (error) {
        console.warn("Viewer session cleanup failed:", error);
    }
}

// =====================================================
// BACK BUTTON
// =====================================================

if (backBtn) {
    backBtn.addEventListener("click", async () => {
        await leaveLiveStream();
        window.location.href = "index.html";
    });
}

window.addEventListener("pagehide", () => {
    if (hostAnswerListener) hostAnswerListener();
    if (hostCandidatesListener) hostCandidatesListener();
    if (coHostInvitationListener) coHostInvitationListener();
    if (chatListener) chatListener();
    if (streamListener) streamListener();
    if (viewerCountListener) viewerCountListener();

    closePeerConnection(hostPeerConnection);
    closePeerConnection(coHostPeerConnection);
});

window.addEventListener("beforeunload", () => {
    closePeerConnection(hostPeerConnection);
    closePeerConnection(coHostPeerConnection);
});
