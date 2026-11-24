
import { auth, db, storage } from "./firebase.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
    doc,
    getDoc,
    getDocs,
    updateDoc,
    setDoc,
    deleteDoc,
    collection,
    addDoc,
    onSnapshot,
    query,
    where,
    limit,
    orderBy,
    serverTimestamp,
    increment
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

// =====================================================
// ALQLIC LIVE STREAM — HOST
// Complete host, viewer, co-host, chat and recording code
// =====================================================

const params = new URLSearchParams(window.location.search);
const streamId = params.get("streamId");

const $ = id => document.getElementById(id);

const localVideo = $("localVideo");
const streamTitleInput = $("streamTitle");
const titleElement = $("title");
const descriptionInput = $("description");
const viewerCountElement = $("viewerCount");
const likeCountElement = $("liveLikeCount");
const micBtn = $("micBtn");
const cameraBtn = $("cameraBtn");
const switchCameraBtn = $("switchCameraBtn");
const endLiveBtn = $("endLiveBtn");
const backBtn = $("backBtn");
const hostLikeBtn = $("hostLikeBtn");

const chatMessages = $("chatMessages");
const chatInput = $("chatInput");
const sendChatBtn = $("sendChatBtn");

const inviteCoHostBtn = $("inviteCoHostBtn");
const closeCoHostInviteBtn = $("closeCoHostInviteBtn");
const sendCoHostInviteBtn = $("sendCoHostInviteBtn");
const coHostUsernameInput = $("coHostUsername");
const coHostInvitePanel = $("coHostInvitePanel");
const coHostInviteMessage = $("coHostInviteMessage");
const coHostUserSuggestions = $("coHostUserSuggestions");
const rtcConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};

let currentUser = null;
let streamData = null;

let localStream = null;
let usingFrontCamera = true;
let micEnabled = true;
let cameraEnabled = true;

let isEnding = false;
let listenersStarted = false;

let mediaRecorder = null;
let recordedChunks = [];
let recordedVideoBlob = null;

const viewerConnections = new Map();
const viewerCandidateListeners = new Map();

let unsubscribeOffers = null;
let unsubscribeViewers = null;
let unsubscribeMessages = null;
let unsubscribeLikes = null;
let unsubscribeCoHostInvitations = null;

let coHostPeerConnection = null;
let coHostMediaStream = new MediaStream();
let coHostRemoteUserId = null;
let coHostInvitationId = null;
let coHostRelayStarted = false;

let unsubscribeCoHostCandidates = null;
let unsubscribeCoHostViewerOffers = null;
let unsubscribeCoHostInvitationStatus = null;

const coHostViewerConnections = new Map();
const coHostViewerCandidateListeners = new Map();

const acceptedCoHostInvitations = new Set();

function showMessage(message) {
    console.log("[AlQlic Live]", message);
}

function setText(element, value) {
    if (element) element.textContent = value;
}

function showInviteMessage(message) {
    setText(coHostInviteMessage, message);
}

function closePeerConnection(pc) {
    if (!pc) return;
    try {
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.onconnectionstatechange = null;
        pc.close();
    } catch (error) {
        console.warn("Peer close error:", error);
    }
}

function stopStreamTracks(stream) {
    if (!stream) return;
    stream.getTracks().forEach(track => {
        try {
            track.stop();
        } catch (_) {}
    });
}

async function waitForIceGathering(pc) {
    if (pc.iceGatheringState === "complete") return;

    await new Promise(resolve => {
        let finished = false;

        const finish = () => {
            if (finished) return;
            finished = true;
            pc.removeEventListener("icegatheringstatechange", check);
            clearTimeout(timeout);
            resolve();
        };

        const check = () => {
            if (pc.iceGatheringState === "complete") finish();
        };

        const timeout = setTimeout(finish, 10000);
        pc.addEventListener("icegatheringstatechange", check);
        check();
    });
}

// =====================================================
// AUTHENTICATION AND STREAM INITIALIZATION
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

    try {
        const streamRef = doc(db, "liveStreams", streamId);
        const streamSnap = await getDoc(streamRef);

        if (!streamSnap.exists()) {
            alert("This live stream does not exist.");
            window.location.href = "index.html";
            return;
        }

        streamData = streamSnap.data();

        if (streamData.hostId !== user.uid) {
            alert("You are not the host of this live stream.");
            window.location.href = "index.html";
            return;
        }

        await startCamera();
        await updateDoc(streamRef, {
            status: "live",
            hostOnline: true,
            updatedAt: serverTimestamp()
        });

        if (streamTitleInput && streamData.title) {
            streamTitleInput.value = streamData.title;
        }

        if (titleElement) {
            titleElement.textContent = streamData.title || "Live stream";
        }

        startHostListeners();

    } catch (error) {
        console.error("Live initialization failed:", error);
        alert("Unable to start the live stream. Check your connection and permissions.");
    }
});

// =====================================================
// HOST CAMERA AND MICROPHONE
// =====================================================

async function startCamera(preserveRecording = false) {
    const oldStream = localStream;

    const newStream = await navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        },
        video: {
            facingMode: usingFrontCamera ? "user" : "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 }
        }
    });

    localStream = newStream;

    const audioTrack = localStream.getAudioTracks()[0];
    const videoTrack = localStream.getVideoTracks()[0];

    if (audioTrack) audioTrack.enabled = micEnabled;
    if (videoTrack) videoTrack.enabled = cameraEnabled;

    if (localVideo) {
        localVideo.srcObject = localStream;
        localVideo.muted = true;
        localVideo.playsInline = true;
        localVideo.play().catch(() => {});
    }

    if (oldStream) {
        oldStream.getTracks().forEach(track => {
            if (track.readyState !== "ended") track.stop();
        });
    }

    if (preserveRecording && mediaRecorder && mediaRecorder.state !== "inactive") {
        try {
            mediaRecorder.stop();
        } catch (_) {}
    }

    startRecording();
}

function startRecording() {
    if (!localStream || !window.MediaRecorder) return;

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        try {
            mediaRecorder.stop();
        } catch (_) {}
    }

    try {
        const options = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
            ? { mimeType: "video/webm;codecs=vp9,opus" }
            : { mimeType: "video/webm" };

        mediaRecorder = new MediaRecorder(localStream, options);

        mediaRecorder.ondataavailable = event => {
            if (event.data && event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            if (recordedChunks.length) {
                recordedVideoBlob = new Blob(recordedChunks, {
                    type: "video/webm"
                });
            }
        };

        mediaRecorder.start(1000);

    } catch (error) {
        console.warn("Recording could not start:", error);
    }
}


async function uploadRecording() {
    if (!recordedVideoBlob || !currentUser || !streamId) {
        return false;
    }

    try {
        const fileRef = ref(
            storage,
            `liveVideos/${currentUser.uid}/${streamId}.webm`
        );

        await uploadBytes(fileRef, recordedVideoBlob, {
            contentType: "video/webm"
        });

        const videoURL = await getDownloadURL(fileRef);

        await updateDoc(doc(db, "liveStreams", streamId), {
            videoURL,
            videoPath: `liveVideos/${currentUser.uid}/${streamId}.webm`,
            videoSaved: true,
            savedAt: serverTimestamp()
        });

        showMessage("Your live video was saved successfully.");

        return true;

    } catch (error) {
        console.error("Recording upload failed:", error);

        alert(
            "Your live video could not be saved.\n\n" +
            "Error: " + error.message
        );

        return false;
    }
}

if (micBtn) {
    micBtn.addEventListener("click", () => {
        micEnabled = !micEnabled;

        if (localStream) {
            localStream.getAudioTracks().forEach(track => {
                track.enabled = micEnabled;
            });
        }

        micBtn.textContent = micEnabled ? "Mute" : "Unmute";
    });
}

if (cameraBtn) {
    cameraBtn.addEventListener("click", () => {
        cameraEnabled = !cameraEnabled;

        if (localStream) {
            localStream.getVideoTracks().forEach(track => {
                track.enabled = cameraEnabled;
            });
        }

        cameraBtn.textContent = cameraEnabled ? "Turn camera off" : "Turn camera on";
    });
}

if (switchCameraBtn) {
    switchCameraBtn.addEventListener("click", async () => {
        usingFrontCamera = !usingFrontCamera;

        try {
            await startCamera(true);

            for (const pc of viewerConnections.values()) {
                const sender = pc.getSenders().find(
                    item => item.track && item.track.kind === "video"
                );

                const newTrack = localStream.getVideoTracks()[0];

                if (sender && newTrack) {
                    await sender.replaceTrack(newTrack);
                }
            }
        } catch (error) {
            console.error("Camera switch failed:", error);
            usingFrontCamera = !usingFrontCamera;
        }
    });
}

// =====================================================
// HOST LISTENERS
// =====================================================

function startHostListeners() {
    if (listenersStarted) return;
    listenersStarted = true;

    listenForViewerOffers();
    listenForViewerCount();
    listenForChatMessages();
    listenForLikes();
    listenForCoHostInvitations();
}

// =====================================================
// VIEWER CONNECTIONS — HOST TO VIEWERS
// =====================================================

function listenForViewerOffers() {
    const offersRef = collection(db, "liveStreams", streamId, "offers");

    unsubscribeOffers = onSnapshot(offersRef, async snapshot => {
        for (const change of snapshot.docChanges()) {
            if (change.type !== "added" && change.type !== "modified") continue;

            const sessionId = change.doc.id;
            const offerData = change.doc.data();

            if (!offerData.offer || viewerConnections.has(sessionId)) continue;

            try {
                await connectViewer(sessionId, offerData.offer);
            } catch (error) {
                console.error("Viewer connection failed:", sessionId, error);
            }
        }
    });
}

async function connectViewer(sessionId, offer) {
    if (viewerConnections.has(sessionId)) return;

    const pc = new RTCPeerConnection(rtcConfig);
    viewerConnections.set(sessionId, pc);

    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    const viewerRef = doc(db, "liveStreams", streamId, "viewers", sessionId);

    pc.onicecandidate = async event => {
        if (!event.candidate) return;

        try {
            await addDoc(
                collection(viewerRef, "hostCandidates"),
                event.candidate.toJSON()
            );
        } catch (error) {
            console.error("Host ICE write failed:", error);
        }
    };

    pc.onconnectionstatechange = async () => {
        if (pc.connectionState === "connected") {
            try {
                await setDoc(viewerRef, {
                    status: "connected",
                    connectedAt: serverTimestamp()
                }, { merge: true });
            } catch (_) {}
        }

        if (["failed", "closed"].includes(pc.connectionState)) {
            removeViewerConnection(sessionId);
        }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const viewerCandidatesRef = collection(viewerRef, "viewerCandidates");

    const unsubscribeCandidates = onSnapshot(viewerCandidatesRef, snapshot => {
        snapshot.docChanges().forEach(async change => {
            if (change.type !== "added") return;

            try {
                await pc.addIceCandidate(
                    new RTCIceCandidate(change.doc.data())
                );
            } catch (error) {
                console.warn("Viewer ICE candidate could not be added:", error);
            }
        });
    });

    viewerCandidateListeners.set(sessionId, unsubscribeCandidates);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceGathering(pc);

    await setDoc(viewerRef, {
        answer: pc.localDescription.toJSON(),
        status: "connecting",
        hostId: currentUser.uid,
        createdAt: serverTimestamp()
    }, { merge: true });
}

function removeViewerConnection(sessionId) {
    const unsubscribe = viewerCandidateListeners.get(sessionId);
    if (unsubscribe) unsubscribe();

    viewerCandidateListeners.delete(sessionId);

    const pc = viewerConnections.get(sessionId);
    closePeerConnection(pc);
    viewerConnections.delete(sessionId);
}

function listenForViewerCount() {
    const viewersRef = collection(db, "liveStreams", streamId, "viewers");

    unsubscribeViewers = onSnapshot(viewersRef, snapshot => {
        const count = snapshot.docs.filter(item =>
            item.data().status === "connected"
        ).length;

        setText(viewerCountElement, count);
    });
}

// =====================================================
// SEARCH AND DISPLAY ALQLIC USER SUGGESTIONS
// =====================================================
let coHostSearchRequest = 0;

if (coHostUsernameInput) {

    coHostUsernameInput.addEventListener("input", async () => {

        const username = coHostUsernameInput.value
            .trim()
            .replace(/^@/, "")
            .toLowerCase();

        const requestId = ++coHostSearchRequest;

        if (!coHostUserSuggestions) return;

        coHostUserSuggestions.innerHTML = "";

        if (username.length < 1) return;

        coHostUserSuggestions.textContent = "Searching users...";

        try {

            const usersSnapshot = await getDocs(
                collection(db, "users")
            );

            if (requestId !== coHostSearchRequest) return;

            const matchingUsers = usersSnapshot.docs.filter(userDoc => {

                if (userDoc.id === currentUser.uid) return false;

                const user = userDoc.data();

                const storedUsername = (user.username || "")
                    .trim()
                    .toLowerCase();

               return storedUsername.includes(username);

            }).slice(0, 8);

            coHostUserSuggestions.innerHTML = "";

            if (matchingUsers.length === 0) {
                coHostUserSuggestions.textContent =
                    "No matching users found.";
                return;
            }

            matchingUsers.forEach(userDoc => {

                const user = userDoc.data();
                const usernameValue = user.username || "";

                if (!usernameValue) return;

                const suggestion = document.createElement("button");

                suggestion.type = "button";
                suggestion.className = "co-host-user-suggestion";

                suggestion.textContent =
                    `${user.name || usernameValue} (@${usernameValue})`;

                suggestion.addEventListener("click", () => {

                    coHostUsernameInput.value = usernameValue;
                    coHostUserSuggestions.innerHTML = "";

                });

                coHostUserSuggestions.appendChild(suggestion);

            });

        } catch (error) {

            console.error("Co-host user search failed:", error);

            if (requestId === coHostSearchRequest) {
                coHostUserSuggestions.textContent =
                    "Unable to search users. Check Firestore permissions.";
            }

        }

    });

}
if (inviteCoHostBtn && coHostInvitePanel) {
    inviteCoHostBtn.addEventListener("click", () => {
        coHostInvitePanel.hidden = false;
        coHostInvitePanel.style.display = "block";
    });
}

if (closeCoHostInviteBtn && coHostInvitePanel) {
    closeCoHostInviteBtn.addEventListener("click", () => {
        coHostInvitePanel.hidden = true;
        coHostInvitePanel.style.display = "none";
    });
}

if (sendCoHostInviteBtn) {
    sendCoHostInviteBtn.addEventListener("click", sendCoHostInvitation);
}

async function sendCoHostInvitation() {
    const username = coHostUsernameInput?.value
        ?.trim()
        .replace(/^@/, "")
        
    
    if (!username) {
        showInviteMessage("Enter the user's username.");
        return;
    }

    try {
        showInviteMessage("Searching for user...");

       const usersSnapshot = await getDocs(
    collection(db, "users")
);

const matchingUsers = usersSnapshot.docs.filter(userDoc => {

    const storedUsername = (userDoc.data().username || "")
        .trim()
        .toLowerCase();

    return storedUsername === username.trim().toLowerCase();

});

if (matchingUsers.length === 0) {
    showInviteMessage("User not found.");
    return;
}

const invitedUser = matchingUsers[0];
const invitedData = invitedUser.data();
        if (invitedUser.id === currentUser.uid) {
            showInviteMessage("You cannot invite yourself.");
            return;
        }

        const invitationRef = await addDoc(
            collection(db, "liveStreams", streamId, "coHostInvitations"),
            {
                hostId: currentUser.uid,
                hostName: currentUser.displayName || streamData?.hostName || "Host",
                hostUsername: streamData?.hostUsername || "",
                invitedUserId: invitedUser.id,
                invitedUsername: invitedData.username || username,
                status: "pending",
                createdAt: serverTimestamp()
            }
        );

        showInviteMessage("Invitation sent successfully.");
        if (coHostUsernameInput) coHostUsernameInput.value = "";

        console.log("Co-host invitation created:", invitationRef.id);

    } catch (error) {
        console.error("Co-host invitation failed:", error);
        showInviteMessage("Could not send invitation. Check Firestore permissions.");
    }
}

function listenForCoHostInvitations() {
    const invitationsRef = collection(
        db,
        "liveStreams",
        streamId,
        "coHostInvitations"
    );

    unsubscribeCoHostInvitations = onSnapshot(invitationsRef, snapshot => {
        snapshot.docChanges().forEach(async change => {
            const invitationId = change.doc.id;
            const data = change.doc.data();

            if (data.status === "accepted" && data.coHostOffer) {
                if (acceptedCoHostInvitations.has(invitationId)) return;

                acceptedCoHostInvitations.add(invitationId);
                coHostInvitationId = invitationId;
                coHostRemoteUserId = data.invitedUserId;

                try {
                    await receiveCoHostConnection(invitationId, data);
                } catch (error) {
                    console.error("Co-host connection failed:", error);
                    acceptedCoHostInvitations.delete(invitationId);
                }
            }

            if (
                data.status === "left" ||
                data.status === "declined" ||
                data.status === "ended"
            ) {
                if (invitationId === coHostInvitationId) {
                    await cleanupCoHostConnection();
                }
            }
        });
    });
}

// =====================================================
// HOST RECEIVES CO-HOST AUDIO AND VIDEO
// =====================================================

async function receiveCoHostConnection(invitationId, invitationData) {
    if (coHostPeerConnection) {
        await cleanupCoHostConnection();
    }

    coHostInvitationId = invitationId;
    coHostRemoteUserId = invitationData.invitedUserId;
    coHostMediaStream = new MediaStream();
    coHostRelayStarted = false;

    const invitationRef = doc(
        db,
        "liveStreams",
        streamId,
        "coHostInvitations",
        invitationId
    );

    const pc = new RTCPeerConnection(rtcConfig);
    coHostPeerConnection = pc;

    pc.ontrack = event => {
        const incomingTrack = event.track;

        if (!coHostMediaStream.getTracks().some(
            track => track.id === incomingTrack.id
        )) {
            coHostMediaStream.addTrack(incomingTrack);
        }

        console.log("Co-host media received:", incomingTrack.kind);

        incomingTrack.onended = () => {
            console.log("Co-host track ended:", incomingTrack.kind);
        };

        if (
            coHostMediaStream.getAudioTracks().length > 0 &&
            coHostMediaStream.getVideoTracks().length > 0 &&
            !coHostRelayStarted
        ) {
            coHostRelayStarted = true;
            listenForCoHostViewerOffers(invitationId);
        }
    };

    pc.onicecandidate = async event => {
        if (!event.candidate) return;

        try {
            await addDoc(
                collection(invitationRef, "hostCoHostCandidates"),
                event.candidate.toJSON()
            );
        } catch (error) {
            console.error("Host-to-co-host ICE write failed:", error);
        }
    };

    pc.onconnectionstatechange = () => {
        console.log("Host/co-host connection:", pc.connectionState);

        if (pc.connectionState === "failed") {
            cleanupCoHostConnection();
        }
    };

    await pc.setRemoteDescription(
        new RTCSessionDescription(invitationData.coHostOffer)
    );

    const coHostCandidatesRef = collection(
        invitationRef,
        "coHostCandidates"
    );

    unsubscribeCoHostCandidates = onSnapshot(
        coHostCandidatesRef,
        snapshot => {
            snapshot.docChanges().forEach(async change => {
                if (change.type !== "added") return;

                try {
                    await pc.addIceCandidate(
                        new RTCIceCandidate(change.doc.data())
                    );
                } catch (error) {
                    console.warn("Co-host ICE candidate error:", error);
                }
            });
        }
    );

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceGathering(pc);

    await updateDoc(invitationRef, {
        coHostAnswer: pc.localDescription.toJSON(),
        coHostConnectedAt: serverTimestamp(),
        status: "accepted"
    });
}

// =====================================================
// RELAY CO-HOST MEDIA TO VIEWERS
// =====================================================

function listenForCoHostViewerOffers(invitationId) {
    if (unsubscribeCoHostViewerOffers) {
        unsubscribeCoHostViewerOffers();
        unsubscribeCoHostViewerOffers = null;
    }

    const viewersRef = collection(
        db,
        "liveStreams",
        streamId,
        "coHostInvitations",
        invitationId,
        "viewers"
    );

    unsubscribeCoHostViewerOffers = onSnapshot(viewersRef, snapshot => {
        snapshot.docChanges().forEach(async change => {
            if (
                change.type !== "added" &&
                change.type !== "modified"
            ) return;

            const viewerSessionId = change.doc.id;
            const data = change.doc.data();

            if (!data.offer) return;
            if (coHostViewerConnections.has(viewerSessionId)) return;

            try {
                await connectCoHostViewer(
                    invitationId,
                    viewerSessionId,
                    data.offer
                );
            } catch (error) {
                console.error("Co-host viewer relay failed:", error);
            }
        });
    });
}

async function connectCoHostViewer(
    invitationId,
    viewerSessionId,
    offer
) {
    const invitationRef = doc(
        db,
        "liveStreams",
        streamId,
        "coHostInvitations",
        invitationId
    );

    const viewerRef = doc(
        invitationRef,
        "viewers",
        viewerSessionId
    );

    const pc = new RTCPeerConnection(rtcConfig);
    coHostViewerConnections.set(viewerSessionId, pc);

    coHostMediaStream.getTracks().forEach(track => {
        pc.addTrack(track, coHostMediaStream);
    });

    pc.onicecandidate = async event => {
        if (!event.candidate) return;

        try {
            await addDoc(
                collection(viewerRef, "hostCandidates"),
                event.candidate.toJSON()
            );
        } catch (error) {
            console.error("Co-host relay ICE write failed:", error);
        }
    };

    pc.onconnectionstatechange = () => {
        if (["failed", "closed"].includes(pc.connectionState)) {
            removeCoHostViewerConnection(viewerSessionId);
        }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const unsubscribeCandidates = onSnapshot(
        collection(viewerRef, "viewerCandidates"),
        snapshot => {
            snapshot.docChanges().forEach(async change => {
                if (change.type !== "added") return;

                try {
                    await pc.addIceCandidate(
                        new RTCIceCandidate(change.doc.data())
                    );
                } catch (error) {
                    console.warn("Co-host viewer ICE error:", error);
                }
            });
        }
    );

    coHostViewerCandidateListeners.set(
        viewerSessionId,
        unsubscribeCandidates
    );

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceGathering(pc);

    await setDoc(viewerRef, {
        answer: pc.localDescription.toJSON(),
        status: "connecting",
        hostId: currentUser.uid,
        createdAt: serverTimestamp()
    }, { merge: true });
}

function removeCoHostViewerConnection(viewerSessionId) {
    const unsubscribe = coHostViewerCandidateListeners.get(viewerSessionId);
    if (unsubscribe) unsubscribe();

    coHostViewerCandidateListeners.delete(viewerSessionId);

    const pc = coHostViewerConnections.get(viewerSessionId);
    closePeerConnection(pc);
    coHostViewerConnections.delete(viewerSessionId);
}

async function cleanupCoHostConnection() {
    if (unsubscribeCoHostCandidates) {
        unsubscribeCoHostCandidates();
        unsubscribeCoHostCandidates = null;
    }

    if (unsubscribeCoHostViewerOffers) {
        unsubscribeCoHostViewerOffers();
        unsubscribeCoHostViewerOffers = null;
    }

    for (const viewerSessionId of [...coHostViewerConnections.keys()]) {
        removeCoHostViewerConnection(viewerSessionId);
    }

    closePeerConnection(coHostPeerConnection);
    coHostPeerConnection = null;

    stopStreamTracks(coHostMediaStream);
    coHostMediaStream = new MediaStream();

    if (coHostInvitationId) {
        acceptedCoHostInvitations.delete(coHostInvitationId);
    }

    coHostRemoteUserId = null;
    coHostInvitationId = null;
    coHostRelayStarted = false;
}

// =====================================================
// CHAT
// =====================================================

function listenForChatMessages() {
    const messagesRef = collection(db, "liveStreams", streamId, "messages");

    unsubscribeMessages = onSnapshot(
        query(messagesRef, orderBy("createdAt", "asc"), limit(100)),
        snapshot => {
            if (!chatMessages) return;

            chatMessages.innerHTML = "";

            snapshot.forEach(messageDoc => {
                const message = messageDoc.data();

                const item = document.createElement("div");
                item.className = "live-chat-message";

                const name = document.createElement("strong");
                name.textContent = `${message.username || "User"}: `;

                const body = document.createElement("span");
                body.textContent = message.text || "";

                item.append(name, body);
                chatMessages.appendChild(item);
            });

            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    );
}

async function sendHostChatMessage() {
    const text = chatInput?.value?.trim();
    if (!text) return;

    try {
        await addDoc(
            collection(db, "liveStreams", streamId, "messages"),
            {
                userId: currentUser.uid,
                username: currentUser.displayName || "Host",
                text,
                createdAt: serverTimestamp()
            }
        );

        chatInput.value = "";
    } catch (error) {
        console.error("Host chat message failed:", error);
    }
}

if (sendChatBtn) {
    sendChatBtn.addEventListener("click", sendHostChatMessage);
}

if (chatInput) {
    chatInput.addEventListener("keydown", event => {
        if (event.key === "Enter") sendHostChatMessage();
    });
}

// =====================================================
// LIKES
// =====================================================

function listenForLikes() {
    const streamRef = doc(db, "liveStreams", streamId);

    unsubscribeLikes = onSnapshot(streamRef, snapshot => {
        if (!snapshot.exists()) return;

        setText(likeCountElement, snapshot.data().likes || 0);
    });
}

async function sendHostLike() {
    if (!currentUser || !streamId) {
        console.error("Cannot like: user or stream ID is missing.");
        return;
    }

    if (!hostLikeBtn) {
        console.error("Like button was not found.");
        return;
    }

    hostLikeBtn.disabled = true;

    try {
        const streamRef = doc(db, "liveStreams", streamId);

        await updateDoc(streamRef, {
            likes: increment(1)
        });

        console.log("Host like added successfully.");

    } catch (error) {
        console.error("Host like failed:", error);
        alert("Could not send your like. Check the browser console for details.");

    } finally {
        hostLikeBtn.disabled = false;
    }
}

if (hostLikeBtn) {
    hostLikeBtn.addEventListener("click", sendHostLike);
} else {
    console.error("HTML element hostLikeBtn was not found.");
}
// =====================================================
// STOP ALL LISTENERS AND CONNECTIONS
// =====================================================

function stopLiveListeners() {
    const unsubscribers = [
        unsubscribeOffers,
        unsubscribeViewers,
        unsubscribeMessages,
        unsubscribeLikes,
        unsubscribeCoHostInvitations,
        unsubscribeCoHostCandidates,
        unsubscribeCoHostViewerOffers
    ];

    unsubscribers.forEach(unsubscribe => {
        if (unsubscribe) {
            try {
                unsubscribe();
            } catch (_) {}
        }
    });

    unsubscribeOffers = null;
    unsubscribeViewers = null;
    unsubscribeMessages = null;
    unsubscribeLikes = null;
    unsubscribeCoHostInvitations = null;
    unsubscribeCoHostCandidates = null;
    unsubscribeCoHostViewerOffers = null;

    for (const sessionId of [...viewerConnections.keys()]) {
        removeViewerConnection(sessionId);
    }

    for (const sessionId of [...coHostViewerConnections.keys()]) {
        removeCoHostViewerConnection(sessionId);
    }
}

// =====================================================
// END LIVE STREAM
// =====================================================


async function endLiveStream() {
    if (isEnding) return;

    if (!currentUser || !streamId) {
        alert("Unable to end live: stream information is missing.");
        return;
    }

    const shouldSave = confirm(
        "Do you want to SAVE your recorded live video?\n\n" +
        "OK = Save Video\n" +
        "Cancel = Discard Video\n\n" +
        "Your live stream will end either way."
    );

    isEnding = true;

    if (endLiveBtn) {
        endLiveBtn.disabled = true;
    }

    try {
        console.log("Ending live stream...");

        stopLiveListeners();
        await cleanupCoHostConnection();

        if (mediaRecorder && mediaRecorder.state !== "inactive") {
            await new Promise((resolve, reject) => {
                mediaRecorder.addEventListener("stop", resolve, { once: true });

                mediaRecorder.addEventListener("error", event => {
                    reject(event.error || new Error("Recording failed."));
                }, { once: true });

                mediaRecorder.stop();
            });
        }

        if (recordedChunks.length > 0) {
            recordedVideoBlob = new Blob(recordedChunks, {
                type: "video/webm"
            });
        }

        if (shouldSave) {
            alert(
                "Video saving is currently unavailable on the free plan.\n\n" +
                "Your live stream will end, but the recording will not be saved."
            );
        } else {
            console.log("User selected Discard Video.");
        }

        recordedChunks.length = 0;
        recordedVideoBlob = null;

        await updateDoc(doc(db, "liveStreams", streamId), {
            status: "ended",
            hostOnline: false,
            endedAt: serverTimestamp()
        });

        stopStreamTracks(localStream);
        localStream = null;

        console.log("Live stream ended successfully.");

        window.location.href = "index.html";

    } catch (error) {
        console.error("End live failed:", error);

        isEnding = false;

        if (endLiveBtn) {
            endLiveBtn.disabled = false;
        }

        alert("Could not end your live stream: " + error.message);
    }
}

if (endLiveBtn) {
    endLiveBtn.addEventListener("click", endLiveStream);
}

if (backBtn) {
    backBtn.addEventListener("click", endLiveStream);
}
