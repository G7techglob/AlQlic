
import { auth, db, storage } from "./firebase.js";

import {
    doc,
    getDoc,
    getDocs,
    updateDoc,
    setDoc,
    collection,
    addDoc,
    onSnapshot,
    query,
    where,
    limit,
    serverTimestamp,
    increment,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";


console.log("✅ HOST Live JS loaded");



// =====================================================
// SHARE LIVE STREAM
// =====================================================

const shareLiveBtn = document.getElementById("shareLiveBtn");

if (shareLiveBtn) {
    shareLiveBtn.addEventListener("click", async () => {

        const liveUrl = window.location.href;

        const shareData = {
            title: "Join my AlQlic Live",
            text: "I'm live on AlQlic! Join me here:",
            url: liveUrl
        };

        try {

            if (navigator.share) {
                await navigator.share(shareData);

            } else if (navigator.clipboard) {
                await navigator.clipboard.writeText(liveUrl);
                alert("Live link copied! You can now share it.");

            } else {
                prompt("Copy your livestream link:", liveUrl);
            }

        } catch (error) {
            if (error.name !== "AbortError") {
                console.error("Share Live error:", error);
            }
        }
    });
}


// =====================================================
// STREAM ID
// =====================================================

const params = new URLSearchParams(window.location.search);
const streamId = params.get("streamId");


// =====================================================
// ELEMENTS
// =====================================================

const localVideo = document.getElementById("localVideo");
const streamTitle = document.getElementById("streamTitle");
const title = document.getElementById("title");
const description = document.getElementById("description");
const viewerCount = document.getElementById("viewerCount");

const liveLikeCount = document.getElementById("liveLikeCount");
const liveLikesOverlay = document.getElementById("liveLikesOverlay");

const micBtn = document.getElementById("micBtn");
const cameraBtn = document.getElementById("cameraBtn");
const switchCameraBtn = document.getElementById("switchCameraBtn");
const endLiveBtn = document.getElementById("endLiveBtn");
const backBtn = document.getElementById("backBtn");
const hostLikeBtn = document.getElementById("hostLikeBtn");

const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");
const chatMessages = document.getElementById("chatMessages");

// =====================================================
// CO-HOST INVITATION ELEMENTS
// =====================================================

const inviteCoHostBtn = document.getElementById("inviteCoHostBtn");

const coHostInvitePanel = document.getElementById("coHostInvitePanel");

const coHostUsername = document.getElementById("coHostUsername");

const sendCoHostInviteBtn = document.getElementById("sendCoHostInviteBtn");

const closeCoHostInviteBtn = document.getElementById("closeCoHostInviteBtn");

const coHostInviteStatus = document.getElementById("coHostInviteStatus");

// =====================================================
// CO-HOST INVITATION PANEL CONTROLS
// =====================================================

inviteCoHostBtn.addEventListener("click", () => {
    coHostInvitePanel.style.display = "block";
    coHostInviteStatus.textContent = "";
    coHostUsername.value = "";
});

closeCoHostInviteBtn.addEventListener("click", () => {
    coHostInvitePanel.style.display = "none";
});

// =====================================================
// SEND CO-HOST INVITATION
// =====================================================

sendCoHostInviteBtn.addEventListener("click", async () => {

    const username = coHostUsername.value.trim().replace(/^@/, "");

    if (!username) {
        coHostInviteStatus.textContent = "Enter a username first.";
        return;
    }

    if (!auth.currentUser) {
        coHostInviteStatus.textContent = "Please log in first.";
        return;
    }

    sendCoHostInviteBtn.disabled = true;
    coHostInviteStatus.textContent = "Searching for user...";

    try {

        // Find the user by AlQlic username
        const usersQuery = query(
            collection(db, "users"),
            where("username", "==", username),
            limit(1)
        );

        const usersSnapshot = await getDocs(usersQuery);

        if (usersSnapshot.empty) {
            coHostInviteStatus.textContent = "User not found. Check the username.";
            return;
        }

        const invitedUserDoc = usersSnapshot.docs[0];
        const invitedUserId = invitedUserDoc.id;

        if (invitedUserId === auth.currentUser.uid) {
            coHostInviteStatus.textContent = "You cannot invite yourself.";
            return;
        }

        // Get host profile
        const hostSnapshot = await getDoc(
            doc(db, "users", auth.currentUser.uid)
        );

        const hostData = hostSnapshot.exists()
            ? hostSnapshot.data()
            : {};

        // Save invitation in this live stream
        await addDoc(
            collection(db, "liveStreams", streamId, "coHostInvitations"),
            {
                hostId: auth.currentUser.uid,
                hostName: hostData.name || auth.currentUser.displayName || "AlQlic Host",
                hostUsername: hostData.username || "",
                invitedUserId: invitedUserId,
                invitedUsername: invitedUserDoc.data().username || username,
                status: "pending",
                createdAt: serverTimestamp()
            }
        );

        coHostInviteStatus.textContent = "Invitation sent successfully!";

    } catch (error) {

        console.error("Co-host invitation error:", error);

        coHostInviteStatus.textContent =
            "Could not send invitation. Please try again.";

    } finally {

        sendCoHostInviteBtn.disabled = false;

    }

});

// =====================================================
// VARIABLES
// =====================================================

let localStream = null;

let usingFrontCamera = true;
let microphoneEnabled = true;
let cameraEnabled = true;

let peerConnections = {};

// =====================================================
// CO-HOST WEBRTC CONNECTION
// =====================================================

let coHostPeerConnection = null;
let coHostMediaStream = null;
let coHostId = null;
let unsubscribeCoHostCandidates = null;
let unsubscribeCoHostAnswer = null;
let unsubscribeCoHostHostCandidates = null;
let coHostRemoteStream = new MediaStream();
let coHostViewerConnections = {};
let unsubscribeCoHostViewerOffers = null;
let unsubscribeCoHostViewerCandidates = {};
let coHostViewerOffersStarted = false;

let isEnding = false;

let mediaRecorder = null;
let recordedChunks = [];
let recordedVideoBlob = null;

let shouldSaveVideo = false;

let unsubscribeViewers = null;
let unsubscribeOffers = null;
let unsubscribeCoHostInvitations = null;
let acceptedCoHostInvitations = new Set();
let unsubscribeMessages = null;

let unsubscribeStreamStats = null;
let unsubscribeLikeEvents = null;
let unsubscribeViewerCandidates = {};


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
    window.location.replace("stream.html");
}


// =====================================================
// AUTHENTICATION
// =====================================================

auth.onAuthStateChanged(async user => {

    if (!user) {
        alert("Please log in before managing your live.");
        window.location.replace("login.html");
        return;
    }

    try {

        const loaded = await loadHostStream(user);

        if (!loaded) {
            return;
        }

        const cameraReady = await startCamera();

        if (!cameraReady) {
            console.error("Host camera could not be started.");
            return;
        }

        startSignaling();
        startLiveChat();
        startLiveReactions();

    } catch (error) {

        console.error("Host startup error:", error);

        alert("Unable to start the live stream. Check the browser console.");

    }

});


// =====================================================
// LOAD HOST STREAM
// =====================================================

async function loadHostStream(user) {

    try {

        const streamRef = doc(
            db,
            "liveStreams",
            streamId
        );

        const streamSnap = await getDoc(streamRef);

        if (!streamSnap.exists()) {

            alert("This live stream does not exist.");

            window.location.replace("stream.html");

            return false;
        }

        const stream = streamSnap.data();


        // HOST SECURITY CHECK

        if (stream.hostId !== user.uid) {

            alert("Only the host can open this live screen.");

            window.location.replace(
                `watch-live.html?streamId=${encodeURIComponent(streamId)}`
            );

            return false;
        }


        // CHECK LIVE STATUS

        if (stream.status !== "live") {

            alert("This live stream has already ended.");

            window.location.replace("stream.html");

            return false;
        }


        // DISPLAY STREAM INFORMATION

        const streamName = stream.title || "AlQlic Live";

        if (streamTitle) {
            streamTitle.textContent = streamName;
        }

        if (title) {
            title.textContent = streamName;
        }

        if (description) {
            description.textContent = stream.description || "";
        }

        if (viewerCount) {
            viewerCount.textContent = stream.viewerCount || 0;
        }

        if (liveLikeCount) {
            liveLikeCount.textContent = stream.likes || 0;
        }


        // WATCH VIEWER COUNT

        unsubscribeViewers = onSnapshot(
            collection(
                db,
                "liveStreams",
                streamId,
                "viewers"
            ),

            snapshot => {

                const count = snapshot.docs.filter(viewerDoc => {
                    return viewerDoc.data().status === "connected";
                }).length;

                if (viewerCount) {
                    viewerCount.textContent = count;
                }

                updateDoc(
                    streamRef,
                    {
                        viewerCount: count
                    }
                ).catch(error => {

                    console.error(
                        "Viewer count update error:",
                        error
                    );

                });

            },

            error => {

                console.error(
                    "Viewer count listener error:",
                    error
                );

            }
        );

        return true;

    } catch (error) {

        console.error("Load host stream error:", error);

        throw error;

    }

}


// =====================================================
// LIVE LIKES AND FLOATING HEARTS
// =====================================================

function startLiveReactions() {

    if (!streamId) {
        return;
    }


    // LISTEN FOR LIVE LIKES COUNTER

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

            const streamData = snapshot.data();

            if (liveLikeCount) {
                liveLikeCount.textContent = streamData.likes || 0;
            }

            if (viewerCount) {
                viewerCount.textContent = streamData.viewerCount || 0;
            }

        },

        error => {

            console.error(
                "Live statistics listener error:",
                error
            );

        }
    );


    // LISTEN FOR FLOATING HEART EVENTS

    const likeEventsRef = collection(
        db,
        "liveStreams",
        streamId,
        "likeEvents"
    );

    let firstLikeSnapshot = true;

    unsubscribeLikeEvents = onSnapshot(
        likeEventsRef,

        snapshot => {

            // Do not replay old hearts when the host opens the page.

            if (firstLikeSnapshot) {
                firstLikeSnapshot = false;
                return;
            }

            snapshot.docChanges().forEach(change => {

                if (change.type !== "added") {
                    return;
                }

                const likeData = change.doc.data();

                showHostFloatingHeart(
                    likeData.emoji || "❤️"
                );

            });

        },

        error => {

            console.error(
                "Live like events listener error:",
                error
            );

        }
    );

}


// =====================================================
// SHOW FLOATING HEART ON HOST SCREEN
// =====================================================

function showHostFloatingHeart(emoji = "❤️") {

    if (!liveLikesOverlay) {
        return;
    }

    const heart = document.createElement("div");

    heart.className = "floating-live-heart";

    heart.textContent = emoji;

    heart.style.left = `${15 + Math.random() * 65}%`;

    heart.style.bottom = "10px";

    liveLikesOverlay.appendChild(heart);

    setTimeout(() => {

        heart.remove();

    }, 2500);

}


// =====================================================
// HOST LIKES THEIR OWN LIVE
// =====================================================

if (hostLikeBtn) {

    hostLikeBtn.addEventListener("click", async () => {

        const user = auth.currentUser;

        if (!user || isEnding || hostLikeBtn.disabled) {
            return;
        }

        try {

            hostLikeBtn.disabled = true;

            const streamRef = doc(
                db,
                "liveStreams",
                streamId
            );

            const likeEventsRef = collection(
                db,
                "liveStreams",
                streamId,
                "likeEvents"
            );

            const batch = writeBatch(db);

            const likeEventRef = doc(likeEventsRef);

            batch.set(likeEventRef, {
                userId: user.uid,
                emoji: "❤️",
                createdAt: serverTimestamp()
            });

            batch.update(streamRef, {
                likes: increment(1)
            });

            await batch.commit();

            console.log("❤️ Host liked their own live.");

        } catch (error) {

            console.error("Host like error:", error);

        } finally {

            hostLikeBtn.disabled = false;

        }

    });

}

// =====================================================
// START CAMERA
// =====================================================

async function startCamera(preserveRecording = false) {

    try {

        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia
        ) {

            throw new Error(
                "Camera access is unavailable. Use HTTPS and a supported browser."
            );

        }


        // STOP PREVIOUS RECORDING WHEN SWITCHING CAMERA

        if (
            mediaRecorder &&
            mediaRecorder.state !== "inactive"
        ) {

            await new Promise(resolve => {

                mediaRecorder.addEventListener(
                    "stop",
                    resolve,
                    { once: true }
                );

                mediaRecorder.stop();

            });

        }


        // STOP PREVIOUS CAMERA

        if (localStream) {

            localStream.getTracks().forEach(track => {
                track.stop();
            });

        }


        // REQUEST CAMERA AND MICROPHONE

        localStream = await navigator.mediaDevices.getUserMedia({

            video: {
                facingMode: {
                    ideal: usingFrontCamera ? "user" : "environment"
                },
                width: {
                    ideal: 1280
                },
                height: {
                    ideal: 720
                }
            },

            audio: true

        });


        // APPLY MIC AND CAMERA SETTINGS

        localStream.getVideoTracks().forEach(track => {
            track.enabled = cameraEnabled;
        });

        localStream.getAudioTracks().forEach(track => {
            track.enabled = microphoneEnabled;
        });


        // DISPLAY HOST CAMERA

        if (!localVideo) {

            throw new Error(
                "The video element with id 'localVideo' was not found in live.html."
            );

        }

        localVideo.srcObject = localStream;

        localVideo.muted = true;
        localVideo.autoplay = true;
        localVideo.playsInline = true;


        try {

            await localVideo.play();

            console.log("✅ Host camera preview is playing.");

        } catch (playError) {

            console.error(
                "Video playback error:",
                playError
            );

        }


        console.log("✅ Host camera and microphone ready.");

        localStream.getTracks().forEach(track => {

            console.log(
                "Media track:",
                track.kind,
                track.label,
                track.readyState,
                track.enabled
            );

        });


        // START RECORDING

        startLiveRecording(preserveRecording);

        return true;

    } catch (error) {

        console.error("Camera error:", error);

        let message = "Unable to access your camera and microphone.";

        if (error.name === "NotAllowedError") {

            message = "Camera permission was denied. Allow camera and microphone access in your browser.";

        } else if (error.name === "NotFoundError") {

            message = "No camera or microphone was found on this device.";

        } else if (error.name === "NotReadableError") {

            message = "Your camera may already be in use by another application.";

        } else if (error.name === "OverconstrainedError") {

            message = "The selected camera is not available.";

        }

        alert(message);

        return false;

    }

}


// =====================================================
// START LIVE RECORDING
// =====================================================

function startLiveRecording(preserveChunks = false) {

    if (!localStream) {
        return;
    }

    if (typeof MediaRecorder === "undefined") {

        console.warn("MediaRecorder is not supported in this browser.");

        return;
    }


    if (!preserveChunks) {

        recordedChunks = [];
        recordedVideoBlob = null;

    }


    let mimeType = "";

    if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) {

        mimeType = "video/webm;codecs=vp9,opus";

    } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")) {

        mimeType = "video/webm;codecs=vp8,opus";

    } else if (MediaRecorder.isTypeSupported("video/webm")) {

        mimeType = "video/webm";

    }


    try {

        mediaRecorder = mimeType
            ? new MediaRecorder(localStream, { mimeType })
            : new MediaRecorder(localStream);


        mediaRecorder.ondataavailable = event => {

            if (event.data && event.data.size > 0) {
                recordedChunks.push(event.data);
            }

        };


        mediaRecorder.onstop = () => {

            if (recordedChunks.length === 0) {

                console.warn("No recording data captured.");

                return;
            }

            recordedVideoBlob = new Blob(
                recordedChunks,
                {
                    type: mediaRecorder.mimeType || "video/webm"
                }
            );

            console.log(
                "✅ Recording ready:",
                recordedVideoBlob.size,
                "bytes"
            );

        };


        mediaRecorder.onerror = event => {

            console.error(
                "MediaRecorder error:",
                event.error || event
            );

        };


        mediaRecorder.start(1000);

        console.log("🔴 LIVE RECORDING STARTED");

    } catch (error) {

        console.error("Recording error:", error);

    }

}


// =====================================================
// SAVE LIVE RECORDING
// =====================================================

async function saveLiveRecording() {

    if (!recordedVideoBlob) {

        console.warn("No recording available.");

        return;

    }

    try {

        console.log("☁️ Uploading live recording...");

        const user = auth.currentUser;

        if (!user) {
            throw new Error("User is not authenticated.");
        }


        const videoPath =
            `liveVideos/${user.uid}/${streamId}.webm`;

        const videoRef = ref(
            storage,
            videoPath
        );


        await uploadBytes(
            videoRef,
            recordedVideoBlob,
            {
                contentType: "video/webm"
            }
        );


        const videoURL = await getDownloadURL(videoRef);


        await updateDoc(
            doc(
                db,
                "liveStreams",
                streamId
            ),
            {
                videoURL: videoURL,
                videoPath: videoPath,
                videoSaved: true,
                savedAt: serverTimestamp()
            }
        );


        console.log("✅ Live recording saved.");

    } catch (error) {

        console.error("Unable to save recording:", error);

        throw error;

    }

}


// =====================================================
// START HOST SIGNALING
// =====================================================
function startSignaling() {

    listenForCoHostResponses();

    console.log("📡 HOST signaling started.");

    const offersRef = collection(
        db,
        "liveStreams",
        streamId,
        "offers"
    );

    unsubscribeOffers = onSnapshot(
        offersRef,

        async snapshot => {

            for (const change of snapshot.docChanges()) {

                if (change.type !== "added") {
                    continue;
                }

                const sessionId = change.doc.id;

                if (peerConnections[sessionId]) {
                    continue;
                }

                console.log("👤 New viewer session:", sessionId);

                await createViewerConnection(
                    sessionId,
                    change.doc.data()
                );

            }

        },

        error => {
            console.error("Host signaling listener error:", error);
        }
    );

}


// =====================================================
// LISTEN FOR CO-HOST INVITATION RESPONSES
// =====================================================

function listenForCoHostResponses() {

    if (!streamId) return;

    if (unsubscribeCoHostInvitations) {
        unsubscribeCoHostInvitations();
    }

    const invitationsRef = collection(
        db,
        "liveStreams",
        streamId,
        "coHostInvitations"
    );

    unsubscribeCoHostInvitations = onSnapshot(
        invitationsRef,
        snapshot => {

            snapshot.docChanges().forEach(change => {

                if (change.type === "removed") return;

                const invitation = change.doc.data();

               
if (
    invitation.status === "accepted" &&
    invitation.coHostOffer &&
    !acceptedCoHostInvitations.has(change.doc.id)
) {

    acceptedCoHostInvitations.add(change.doc.id);

    coHostInviteStatus.textContent =
        "@" + invitation.invitedUsername +
        " accepted your co-host invitation.";

    console.log(
        "Co-host invitation accepted:",
        invitation.invitedUsername
    );

    receiveCoHostConnection(
        change.doc.id,
        invitation
    );

}


                if (invitation.status === "declined") {

                    coHostInviteStatus.textContent =
                        "@" + invitation.invitedUsername +
                        " declined your co-host invitation.";

                }

                if (invitation.status === "left") {

    console.log("Co-host left the livestream.");

    if (coHostPeerConnection) {
        coHostPeerConnection.close();
        coHostPeerConnection = null;
    }

    if (unsubscribeCoHostCandidates) {
        unsubscribeCoHostCandidates();
        unsubscribeCoHostCandidates = null;
    }

    coHostMediaStream = null;
    coHostId = null;

    acceptedCoHostInvitations.delete(change.doc.id);

    if (coHostInviteStatus) {
        coHostInviteStatus.textContent =
            "Your co-host has left the livestream.";
    }

}

            });

        },
        error => {
            console.error("Co-host response listener error:", error);
        }
    );
}


// =====================================================
// CREATE HOST CONNECTION TO VIEWER
// =====================================================

async function createViewerConnection(sessionId, offerData) {

    let pc = null;

    const viewerId = offerData.viewerId;

    const answerRef = doc(
        db,
        "liveStreams",
        streamId,
        "viewers",
        sessionId
    );

    try {

        if (!localStream) {
            console.error("Host camera stream is unavailable.");
            return;
        }

        if (!viewerId || !offerData.sdp || !offerData.type) {
            console.error("Invalid viewer offer:", sessionId);
            return;
        }

        // CREATE CONNECTION

        pc = new RTCPeerConnection(rtcConfig);

        peerConnections[sessionId] = pc;

        // REGISTER THIS UNIQUE VIEWER SESSION

        await setDoc(
            answerRef,
            {
                answer: null,
                status: "connecting",
                viewerId: viewerId,
                sessionId: sessionId,
                joinedAt: serverTimestamp()
            }
        );

        // SEND CAMERA AND MICROPHONE

        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });

        // SEND HOST ICE CANDIDATES

        pc.onicecandidate = async event => {

            if (!event.candidate) return;

            try {

                await addDoc(
                    collection(
                        db,
                        "liveStreams",
                        streamId,
                        "viewers",
                        sessionId,
                        "hostCandidates"
                    ),
                    event.candidate.toJSON()
                );

            } catch (error) {
                console.error("Host ICE error:", error);
            }

        };

        // CONNECTION STATUS

        pc.onconnectionstatechange = async () => {

            const state = pc.connectionState;

            console.log(
                "🔗 Viewer session:",
                sessionId,
                state
            );

            if (state === "connected" || state === "disconnected") {

                try {

                    await updateDoc(
                        answerRef,
                        {
                            status: state,
                            statusUpdatedAt: serverTimestamp()
                        }
                    );

                } catch (error) {

                    console.error(
                        "Viewer status update error:",
                        error
                    );

                }

            }

            if (state === "failed" || state === "closed") {

                if (unsubscribeViewerCandidates[sessionId]) {
                    unsubscribeViewerCandidates[sessionId]();
                    delete unsubscribeViewerCandidates[sessionId];
                }

                delete peerConnections[sessionId];

            }

        };

        // RECEIVE VIEWER OFFER

        await pc.setRemoteDescription(
            new RTCSessionDescription({
                type: offerData.type,
                sdp: offerData.sdp
            })
        );

        // RECEIVE VIEWER ICE CANDIDATES

        const viewerCandidatesRef = collection(
            db,
            "liveStreams",
            streamId,
            "viewers",
            sessionId,
            "viewerCandidates"
        );

        unsubscribeViewerCandidates[sessionId] = onSnapshot(
            viewerCandidatesRef,

            async snapshot => {

                for (const change of snapshot.docChanges()) {

                    if (change.type !== "added") continue;

                    try {

                        if (
                            !pc ||
                            pc.connectionState === "closed" ||
                            !pc.remoteDescription
                        ) {
                            continue;
                        }

                        await pc.addIceCandidate(
                            new RTCIceCandidate(change.doc.data())
                        );

                        console.log("✅ Viewer ICE candidate added.");

                    } catch (error) {
                        console.error("Viewer ICE error:", error);
                    }

                }

            },

            error => {
                console.error("Viewer ICE listener error:", error);
            }
        );

        // CREATE HOST ANSWER

        const answer = await pc.createAnswer();

        await pc.setLocalDescription(answer);

        // WAIT FOR ICE GATHERING

        await waitForIceGathering(pc);

        // SEND HOST ANSWER

        await updateDoc(
            answerRef,
            {
                answer: {
                    type: pc.localDescription.type,
                    sdp: pc.localDescription.sdp
                },
                status: "connecting"
            }
        );

        console.log(
            "✅ Host answer sent to viewer session:",
            sessionId
        );

    } catch (error) {

        console.error("Host WebRTC error:", error);

        if (unsubscribeViewerCandidates[sessionId]) {
            unsubscribeViewerCandidates[sessionId]();
            delete unsubscribeViewerCandidates[sessionId];
        }

        if (pc) {
            try {
                pc.close();
            } catch {}
        }

        delete peerConnections[sessionId];

        try {

            await setDoc(
                answerRef,
                {
                    status: "failed",
                    statusUpdatedAt: serverTimestamp()
                },
                { merge: true }
            );

        } catch (updateError) {

            console.error(
                "Unable to update viewer status:",
                updateError
            );

        }

    }

}



// =====================================================
// RECEIVE CO-HOST AUDIO AND VIDEO
// =====================================================

async function receiveCoHostConnection(invitationId, invitation) {

    if (coHostPeerConnection) {
        console.warn("A co-host is already connected.");
        return;
    }

    coHostId = invitation.invitedUserId;

    const pc = new RTCPeerConnection(rtcConfig);
    coHostPeerConnection = pc;
    coHostMediaStream = new MediaStream();

    const coHostRef = doc(
        db,
        "liveStreams",
        streamId,
        "coHostInvitations",
        invitationId
    );

    const coHostCandidatesRef = collection(
        db,
        "liveStreams",
        streamId,
        "coHostInvitations",
        invitationId,
        "coHostCandidates"
    );

    const hostCandidatesRef = collection(
        db,
        "liveStreams",
        streamId,
        "coHostInvitations",
        invitationId,
        "hostCoHostCandidates"
    );

 // RECEIVE CO-HOST AUDIO AND VIDEO
pc.ontrack = event => {

    if (!coHostMediaStream.getTracks().some(
        track => track.id === event.track.id
    )) {
        coHostMediaStream.addTrack(event.track);
    }

    console.log("Co-host media received:", event.track.kind);

    if (
        coHostMediaStream.getAudioTracks().length > 0 &&
        coHostMediaStream.getVideoTracks().length > 0 &&
        !coHostViewerOffersStarted
    ) {

        coHostViewerOffersStarted = true;

        listenForCoHostViewerOffers(invitationId);
    }
};
    

    // SEND HOST ICE CANDIDATES TO CO-HOST
    pc.onicecandidate = async event => {

        if (!event.candidate) return;

        try {
            await addDoc(
                hostCandidatesRef,
                event.candidate.toJSON()
            );
        } catch (error) {
            console.error("Host co-host ICE error:", error);
        }
    };

    // MONITOR CO-HOST CONNECTION
    pc.onconnectionstatechange = () => {

        const state = pc.connectionState;

        console.log("Co-host connection:", state);

        if (
            state === "disconnected" ||
            state === "failed" ||
            state === "closed"
        ) {

            console.log("Co-host connection has ended.");

            // STOP CO-HOST VIEWER RELAY LISTENER

if (unsubscribeCoHostViewerOffers) {
    unsubscribeCoHostViewerOffers();
    unsubscribeCoHostViewerOffers = null;
}

// CLOSE ALL CO-HOST VIEWER RELAY CONNECTIONS

Object.keys(coHostViewerConnections).forEach(viewerSessionId => {

    const viewerPC = coHostViewerConnections[viewerSessionId];

    if (viewerPC) {
        viewerPC.close();
    }

    delete coHostViewerConnections[viewerSessionId];

    if (unsubscribeCoHostViewerCandidates[viewerSessionId]) {
        unsubscribeCoHostViewerCandidates[viewerSessionId]();
        delete unsubscribeCoHostViewerCandidates[viewerSessionId];
    }

});

            if (unsubscribeCoHostCandidates) {
                unsubscribeCoHostCandidates();
                unsubscribeCoHostCandidates = null;
            }

            if (coHostPeerConnection === pc) {
                coHostPeerConnection = null;
            }

            if (coHostMediaStream) {
                coHostMediaStream.getTracks().forEach(track => {
                    track.stop();
                });

                coHostMediaStream = null;
            }

            coHostId = null;

            coHostViewerOffersStarted = false;

            if (coHostInviteStatus) {
                coHostInviteStatus.textContent =
                    "Your co-host has disconnected.";
            }
        }
    };

    // CONNECT TO CO-HOST
    try {

        const invitationSnapshot = await getDoc(coHostRef);

        if (!invitationSnapshot.exists()) {
            throw new Error("Co-host invitation no longer exists.");
        }

        const data = invitationSnapshot.data();

        if (!data.coHostOffer) {
            throw new Error("Co-host offer has not been received.");
        }

        // APPLY CO-HOST OFFER
        await pc.setRemoteDescription(
            new RTCSessionDescription(data.coHostOffer)
        );

        // RECEIVE ICE CANDIDATES FROM CO-HOST
        unsubscribeCoHostCandidates = onSnapshot(
            coHostCandidatesRef,
            async snapshot => {

                for (const change of snapshot.docChanges()) {

                    if (change.type !== "added") continue;

                    try {

                        if (
                            pc.remoteDescription &&
                            pc.connectionState !== "closed"
                        ) {
                            await pc.addIceCandidate(
                                new RTCIceCandidate(change.doc.data())
                            );

                            console.log("Co-host ICE candidate received.");
                        }

                    } catch (error) {
                        console.error("Co-host candidate error:", error);
                    }
                }
            },
            error => {
                console.error("Co-host ICE listener error:", error);
            }
        );

        // CREATE HOST ANSWER
        const answer = await pc.createAnswer();

        await pc.setLocalDescription(answer);

        await waitForIceGathering(pc);

        // SEND ANSWER TO CO-HOST
        await updateDoc(coHostRef, {
            coHostAnswer: {
                type: pc.localDescription.type,
                sdp: pc.localDescription.sdp
            },
            coHostConnectedAt: serverTimestamp()
        });

        console.log("Host answer sent to co-host.");

    } catch (error) {

        console.error("Unable to receive co-host media:", error);

        if (unsubscribeCoHostCandidates) {
            unsubscribeCoHostCandidates();
            unsubscribeCoHostCandidates = null;
        }

        pc.close();

        if (coHostMediaStream) {
            coHostMediaStream.getTracks().forEach(track => {
                track.stop();
            });
        }

        if (coHostPeerConnection === pc) {
            coHostPeerConnection = null;
        }

        coHostMediaStream = null;
        coHostId = null;
    }
}

// =====================================================
// LISTEN FOR VIEWERS WHO NEED CO-HOST MEDIA
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

    unsubscribeCoHostViewerOffers = onSnapshot(
        viewersRef,
        snapshot => {

            snapshot.docChanges().forEach(change => {

                if (change.type !== "added" &&
                    change.type !== "modified") {
                    return;
                }

                const viewerData = change.doc.data();
                const viewerSessionId = change.doc.id;

                if (!viewerData.offer) {
                    return;
                }

                if (coHostViewerConnections[viewerSessionId]) {
                    return;
                }

                console.log(
                    "Co-host relay offer received:",
                    viewerSessionId
                );

               connectCoHostViewer(
    invitationId,
    viewerSessionId,
    viewerData
);
            });
        },
        error => {
            console.error(
                "Co-host viewer offer listener error:",
                error
            );
        }
    );
}

// =====================================================
// CONNECT VIEWER TO CO-HOST MEDIA
// =====================================================

async function connectCoHostViewer(
    invitationId,
    viewerSessionId,
    viewerData
) {

    if (coHostViewerConnections[viewerSessionId]) {
        return;
    }

    if (!coHostMediaStream) {
        console.warn("Co-host media is not ready.");
        return;
    }

    const viewerRef = doc(
        db,
        "liveStreams",
        streamId,
        "coHostInvitations",
        invitationId,
        "viewers",
        viewerSessionId
    );

    const viewerCandidatesRef = collection(
        viewerRef,
        "viewerCandidates"
    );

    const hostCandidatesRef = collection(
        viewerRef,
        "hostCandidates"
    );

    const pc = new RTCPeerConnection(rtcConfig);

    coHostViewerConnections[viewerSessionId] = pc;

    let pendingCandidates = [];

    // SEND CO-HOST TRACKS TO THIS VIEWER
    coHostMediaStream.getTracks().forEach(track => {
        pc.addTrack(track, coHostMediaStream);
    });

    // SEND HOST ICE CANDIDATES
    pc.onicecandidate = async event => {

        if (!event.candidate) return;

        try {
            await addDoc(
                hostCandidatesRef,
                event.candidate.toJSON()
            );
        } catch (error) {
            console.error("Co-host relay host ICE error:", error);
        }
    };

    // RECEIVE VIEWER ICE CANDIDATES
    unsubscribeCoHostViewerCandidates[viewerSessionId] =
        onSnapshot(
            viewerCandidatesRef,
            async snapshot => {

                for (const change of snapshot.docChanges()) {

                    if (change.type !== "added") continue;

                    const candidateData = change.doc.data();

                    if (!pc.remoteDescription) {
                        pendingCandidates.push(candidateData);
                        continue;
                    }

                    try {
                        await pc.addIceCandidate(
                            new RTCIceCandidate(candidateData)
                        );
                    } catch (error) {
                        console.error(
                            "Co-host relay viewer ICE error:",
                            error
                        );
                    }
                }
            }
        );

    try {

        // APPLY VIEWER OFFER
        await pc.setRemoteDescription(
            new RTCSessionDescription(viewerData.offer)
        );

        // APPLY EARLY VIEWER ICE CANDIDATES
        for (const candidateData of pendingCandidates) {

            try {
                await pc.addIceCandidate(
                    new RTCIceCandidate(candidateData)
                );
            } catch (error) {
                console.error(
                    "Pending co-host relay ICE error:",
                    error
                );
            }
        }

        pendingCandidates = [];

        // CREATE HOST ANSWER
        const answer = await pc.createAnswer();

        await pc.setLocalDescription(answer);

        await waitForIceGathering(pc);

        // SEND ANSWER TO VIEWER
        await updateDoc(viewerRef, {
            answer: {
                type: pc.localDescription.type,
                sdp: pc.localDescription.sdp
            }
        });

        console.log(
            "Co-host relay answer sent to viewer:",
            viewerSessionId
        );

    } catch (error) {

        console.error(
            "Unable to connect viewer to co-host:",
            error
        );

        pc.close();

        delete coHostViewerConnections[viewerSessionId];

        if (unsubscribeCoHostViewerCandidates[viewerSessionId]) {
            unsubscribeCoHostViewerCandidates[viewerSessionId]();
            delete unsubscribeCoHostViewerCandidates[viewerSessionId];
        }
    }

    // MONITOR VIEWER RELAY CONNECTION
    pc.onconnectionstatechange = () => {

        if (
            pc.connectionState === "failed" ||
            pc.connectionState === "closed"
        ) {

            pc.close();

            delete coHostViewerConnections[viewerSessionId];

            if (unsubscribeCoHostViewerCandidates[viewerSessionId]) {
                unsubscribeCoHostViewerCandidates[viewerSessionId]();
                delete unsubscribeCoHostViewerCandidates[viewerSessionId];
            }
        }
    };
}

// =====================================================
// WAIT FOR ICE GATHERING
// =====================================================

function waitForIceGathering(pc) {

    return new Promise(resolve => {

        if (pc.iceGatheringState === "complete") {
            resolve();
            return;
        }


        let finished = false;

        const finish = () => {

            if (finished) {
                return;
            }

            finished = true;

            pc.removeEventListener(
                "icegatheringstatechange",
                checkIce
            );

            clearTimeout(timeout);

            resolve();

        };


        const checkIce = () => {

            if (pc.iceGatheringState === "complete") {
                finish();
            }

        };


        const timeout = setTimeout(() => {

            console.warn("ICE gathering timed out; continuing.");

            finish();

        }, 10000);


        pc.addEventListener(
            "icegatheringstatechange",
            checkIce
        );

    });

}


// =====================================================
// MICROPHONE BUTTON
// =====================================================

if (micBtn) {

    micBtn.addEventListener("click", () => {

        if (!localStream) {
            return;
        }

        microphoneEnabled = !microphoneEnabled;

        localStream.getAudioTracks().forEach(track => {
            track.enabled = microphoneEnabled;
        });

        micBtn.textContent = microphoneEnabled ? "🎤" : "🔇";

    });

}


// =====================================================
// CAMERA BUTTON
// =====================================================

if (cameraBtn) {

    cameraBtn.addEventListener("click", () => {

        if (!localStream) {
            return;
        }

        cameraEnabled = !cameraEnabled;

        localStream.getVideoTracks().forEach(track => {
            track.enabled = cameraEnabled;
        });

        cameraBtn.textContent = cameraEnabled ? "📷" : "🚫";

    });

}


// =====================================================
// SWITCH CAMERA BUTTON
// =====================================================

if (switchCameraBtn) {

    switchCameraBtn.addEventListener("click", async () => {

        if (isEnding) {
            return;
        }

        usingFrontCamera = !usingFrontCamera;

        const cameraReady = await startCamera(true);

        if (!cameraReady) {
            usingFrontCamera = !usingFrontCamera;
            return;
        }


        // REPLACE VIDEO TRACK FOR CONNECTED VIEWERS

        const newVideoTrack = localStream.getVideoTracks()[0];

        Object.values(peerConnections).forEach(pc => {

            const sender = pc.getSenders().find(s => {
                return s.track && s.track.kind === "video";
            });

            if (sender && newVideoTrack) {

                sender.replaceTrack(newVideoTrack).catch(error => {

                    console.error(
                        "Camera track replacement error:",
                        error
                    );

                });

            }

        });

        console.log("📷 Camera switched.");

    });

}


// =====================================================
// END LIVE BUTTON
// =====================================================

if (endLiveBtn) {

    endLiveBtn.addEventListener("click", async () => {

        if (isEnding) {
            return;
        }

        const confirmed = confirm(
            "Do you want to end your live stream?"
        );

        if (!confirmed) {
            return;
        }

        shouldSaveVideo = confirm(
            "Do you want to save this live video?\n\n" +
            "OK = Save Video\n" +
            "Cancel = Discard Video"
        );

        await endLive();

    });

}


// =====================================================
// STOP FIRESTORE LISTENERS
// =====================================================

function stopLiveListeners() {

    if (unsubscribeViewers) {
        unsubscribeViewers();
        unsubscribeViewers = null;
    }

    if (unsubscribeOffers) {
        unsubscribeOffers();
        unsubscribeOffers = null;
    }

    if (unsubscribeCoHostInvitations) {
        unsubscribeCoHostInvitations();
        unsubscribeCoHostInvitations = null;
    }

    if (unsubscribeCoHostViewerOffers) {
        unsubscribeCoHostViewerOffers();
        unsubscribeCoHostViewerOffers = null;
    }

    if (unsubscribeMessages) {
        unsubscribeMessages();
        unsubscribeMessages = null;
    }

    if (unsubscribeStreamStats) {
        unsubscribeStreamStats();
        unsubscribeStreamStats = null;
    }

    if (unsubscribeLikeEvents) {
        unsubscribeLikeEvents();
        unsubscribeLikeEvents = null;
    }

    Object.keys(unsubscribeViewerCandidates).forEach(sessionId => {

        unsubscribeViewerCandidates[sessionId]();

        delete unsubscribeViewerCandidates[sessionId];

    });

    Object.keys(unsubscribeCoHostViewerCandidates).forEach(viewerSessionId => {

        unsubscribeCoHostViewerCandidates[viewerSessionId]();

        delete unsubscribeCoHostViewerCandidates[viewerSessionId];

    });

}
// =====================================================
// END LIVE
// =====================================================

async function endLive() {

    if (isEnding) {
        return;
    }

    try {

        isEnding = true;

        if (endLiveBtn) {
            endLiveBtn.disabled = true;
            endLiveBtn.textContent = "Ending...";
        }


        // STOP RECORDING

        if (
            mediaRecorder &&
            mediaRecorder.state !== "inactive"
        ) {

            await new Promise(resolve => {

                mediaRecorder.addEventListener(
                    "stop",
                    resolve,
                    { once: true }
                );

                mediaRecorder.stop();

            });

        }


        // SAVE OR DISCARD RECORDING

        if (shouldSaveVideo && recordedVideoBlob) {

            await saveLiveRecording();

        } else {

            recordedChunks = [];
            recordedVideoBlob = null;

            console.log("🗑️ Live recording discarded.");

        }


        // STOP CAMERA

        if (localStream) {

            localStream.getTracks().forEach(track => {
                track.stop();
            });

            localStream = null;

        }


        // CLOSE VIEWER CONNECTIONS

        Object.values(peerConnections).forEach(pc => {

            try {
                pc.close();
            } catch {}

        });

        peerConnections = {};

        // CLOSE CO-HOST CONNECTION


        // CLOSE CO-HOST VIEWER RELAY CONNECTIONS

Object.keys(coHostViewerConnections).forEach(viewerSessionId => {

    const pc = coHostViewerConnections[viewerSessionId];

    if (pc) {
        pc.close();
    }

    delete coHostViewerConnections[viewerSessionId];

    if (unsubscribeCoHostViewerCandidates[viewerSessionId]) {
        unsubscribeCoHostViewerCandidates[viewerSessionId]();
        delete unsubscribeCoHostViewerCandidates[viewerSessionId];
    }

});
        

if (coHostPeerConnection) {

    coHostPeerConnection.close();
    coHostPeerConnection = null;

}

if (unsubscribeCoHostCandidates) {

    unsubscribeCoHostCandidates();
    unsubscribeCoHostCandidates = null;

}

coHostMediaStream = null;
coHostRemoteStream = new MediaStream();
coHostId = null;


        // STOP FIRESTORE LISTENERS

        stopLiveListeners();


        // MARK STREAM ENDED

        await updateDoc(
            doc(
                db,
                "liveStreams",
                streamId
            ),
            {
                status: "ended",
                endedAt: serverTimestamp(),
                viewerCount: 0
            }
        );


        console.log("🛑 LIVE ENDED:", streamId);

        window.location.replace("stream.html");


    } catch (error) {

        console.error("End live error:", error);

        alert("Unable to end the live stream. Check the browser console.");

        isEnding = false;

        if (endLiveBtn) {
            endLiveBtn.disabled = false;
            endLiveBtn.textContent = "🛑 End Live";
        }

    }

}


// =====================================================
// BACK BUTTON
// =====================================================

if (backBtn) {

    backBtn.addEventListener("click", () => {

        /*
         * Back does not end the live stream.
         * It stops the host camera and closes connections.
         */

        if (localStream) {

            localStream.getTracks().forEach(track => {
                track.stop();
            });

            localStream = null;

        }

        Object.values(peerConnections).forEach(pc => {

            try {
                pc.close();
            } catch {}

        });

        peerConnections = {};

        stopLiveListeners();

        window.location.replace("stream.html");

    });

}


// =====================================================
// LIVE CHAT
// =====================================================

function startLiveChat() {

    if (!streamId) {
        return;
    }

    const messagesRef = collection(
        db,
        "liveStreams",
        streamId,
        "messages"
    );


    unsubscribeMessages = onSnapshot(
        messagesRef,

        snapshot => {

            if (!chatMessages) {
                return;
            }

            const messages = [];

            snapshot.forEach(messageDoc => {

                messages.push({
                    id: messageDoc.id,
                    ...messageDoc.data()
                });

            });


            messages.sort((a, b) => {

                const timeA = a.createdAt?.toMillis?.() || 0;
                const timeB = b.createdAt?.toMillis?.() || 0;

                return timeA - timeB;

            });


            chatMessages.innerHTML = "";


            messages.forEach(message => {

                const messageDiv = document.createElement("div");

                messageDiv.className = "live-chat-message";


                const username = document.createElement("strong");

                username.textContent = message.username || "User";


                const text = document.createElement("span");

                text.textContent = message.text || "";


                messageDiv.appendChild(username);

                messageDiv.appendChild(
                    document.createTextNode(" ")
                );

                messageDiv.appendChild(text);

                chatMessages.appendChild(messageDiv);

            });


            chatMessages.scrollTop = chatMessages.scrollHeight;

        },

        error => {

            console.error(
                "Live chat listener error:",
                error
            );

        }
    );

}


// =====================================================
// SEND CHAT MESSAGE
// =====================================================

async function sendChatMessage() {

    const user = auth.currentUser;

    if (!user) {

        alert("Please log in to chat.");

        return;

    }

    if (!chatInput) {
        return;
    }

    const text = chatInput.value.trim();

    if (!text) {
        return;
    }


    try {

        if (sendChatBtn) {
            sendChatBtn.disabled = true;
        }


        await addDoc(
            collection(
                db,
                "liveStreams",
                streamId,
                "messages"
            ),
            {
                userId: user.uid,
                username: user.displayName || user.email || "AlQlic User",
                photoURL: user.photoURL || "",
                text: text,
                createdAt: serverTimestamp()
            }
        );


        chatInput.value = "";

    } catch (error) {

        console.error("Send live chat error:", error);

        alert("Unable to send your message.");

    } finally {

        if (sendChatBtn) {
            sendChatBtn.disabled = false;
        }

        chatInput.focus();

    }

}


// =====================================================
// CHAT EVENTS
// =====================================================

if (sendChatBtn) {

    sendChatBtn.addEventListener(
        "click",
        sendChatMessage
    );

}


if (chatInput) {

    chatInput.addEventListener("keydown", event => {

        if (event.key === "Enter" && !event.shiftKey) {

            event.preventDefault();

            sendChatMessage();

        }

    });

}


// =====================================================
// CLEANUP
// =====================================================

window.addEventListener("beforeunload", () => {

    stopLiveListeners();

    if (localStream) {

        localStream.getTracks().forEach(track => {
            track.stop();
        });

    }

    Object.values(peerConnections).forEach(pc => {

        try {
            pc.close();
        } catch {}

    });

});
