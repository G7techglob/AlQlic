
import { auth, db } from "./firebase.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
    doc,
    getDoc,
    getDocs,
    updateDoc,
    collection,
    query,
    where,
    limit,
    onSnapshot,
    serverTimestamp,
    addDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

console.log("AlQlic Co-Host page loaded");

// =====================================================
// PAGE ELEMENTS
// =====================================================

const invitationSection = document.getElementById("invitationSection");
const invitationMessage = document.getElementById("invitationMessage");

const acceptInviteBtn = document.getElementById("acceptInviteBtn");
const declineInviteBtn = document.getElementById("declineInviteBtn");

const coHostLiveSection = document.getElementById("coHostLiveSection");
const coHostLocalVideo = document.getElementById("coHostLocalVideo");

const coHostMicBtn = document.getElementById("coHostMicBtn");
const coHostCameraBtn = document.getElementById("coHostCameraBtn");
const leaveCoHostBtn = document.getElementById("leaveCoHostBtn");

const coHostStatus = document.getElementById("coHostStatus");

// =====================================================
// STATE
// =====================================================

let currentInvitationId = null;
let currentStreamId = null;
let coHostStream = null;

let microphoneEnabled = true;
let cameraEnabled = true;

let coHostPeerConnection = null;

let unsubscribeInvitations = null;
let unsubscribeCoHostAnswer = null;
let unsubscribeHostCandidates = null;

let receivedHostCandidates = new Set();

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
// WAIT FOR LOGIN
// =====================================================

onAuthStateChanged(auth, async (user) => {

    if (!user) {

        coHostStatus.textContent = "Please log in to join as a co-host.";

        invitationSection.style.display = "none";

        return;
    }

    console.log("Co-host logged in:", user.uid);

    await findCoHostInvitation(user.uid);

});

// =====================================================
// FIND PENDING INVITATION
// =====================================================

async function findCoHostInvitation(userId) {

    coHostStatus.textContent = "Checking for invitations...";

    try {

        const streamsSnapshot = await getDocs(
            collection(db, "liveStreams")
        );

        for (const streamDoc of streamsSnapshot.docs) {

            const invitationsRef = collection(
                db,
                "liveStreams",
                streamDoc.id,
                "coHostInvitations"
            );

            const invitationsQuery = query(
                invitationsRef,
                where("invitedUserId", "==", userId),
                where("status", "==", "pending"),
                limit(1)
            );

            const invitationSnapshot = await getDocs(invitationsQuery);

            if (!invitationSnapshot.empty) {

                const invitationDoc = invitationSnapshot.docs[0];

                currentInvitationId = invitationDoc.id;
                currentStreamId = streamDoc.id;

                const invitation = invitationDoc.data();

                invitationMessage.textContent =
                    (invitation.hostName || "A host") +
                    " invited you to join their live stream.";

                invitationSection.style.display = "block";

                coHostStatus.textContent = "";

                return;
            }

        }

        invitationMessage.textContent =
            "You do not have any pending co-host invitations.";

    } catch (error) {

        console.error("Invitation search error:", error);

        invitationMessage.textContent =
            "Could not check invitations. Please try again.";

    }

}

// =====================================================
// ACCEPT INVITATION
// =====================================================

acceptInviteBtn.addEventListener("click", async () => {

    if (!currentInvitationId || !currentStreamId) {
        return;
    }

    acceptInviteBtn.disabled = true;

    try {

        await updateDoc(
            doc(
                db,
                "liveStreams",
                currentStreamId,
                "coHostInvitations",
                currentInvitationId
            ),
            {
                status: "accepted",
                respondedAt: serverTimestamp()
            }
        );

        invitationSection.style.display = "none";
        coHostLiveSection.style.display = "block";

        coHostStatus.textContent =
            "Invitation accepted. Preparing your camera and microphone...";

        await startCoHostCamera();

    } catch (error) {

        console.error("Accept invitation error:", error);

        coHostStatus.textContent =
            "Could not accept invitation: " + error.message;

    } finally {

        acceptInviteBtn.disabled = false;

    }

});

// =====================================================
// DECLINE INVITATION
// =====================================================

declineInviteBtn.addEventListener("click", async () => {

    if (!currentInvitationId || !currentStreamId) {
        return;
    }

    declineInviteBtn.disabled = true;

    try {

        await updateDoc(
            doc(
                db,
                "liveStreams",
                currentStreamId,
                "coHostInvitations",
                currentInvitationId
            ),
            {
                status: "declined",
                respondedAt: serverTimestamp()
            }
        );

        invitationSection.style.display = "none";

        invitationMessage.textContent =
            "You declined the invitation.";

    } catch (error) {

        console.error("Decline invitation error:", error);

        alert("Could not decline invitation.");

    } finally {

        declineInviteBtn.disabled = false;

    }

});

// =====================================================
// START CO-HOST CAMERA
// =====================================================
async function startCoHostCamera() {

    try {

        coHostStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        coHostLocalVideo.srcObject = coHostStream;

        await coHostLocalVideo.play();

        coHostStatus.textContent =
            "Camera and microphone ready. Connecting to host...";

        // Start the WebRTC connection
        await connectToHost();

    } catch (error) {

        console.error("Co-host camera or connection error:", error);

        coHostStatus.textContent =
            "Could not start camera or connect to host. Check permissions and try again.";

    }

}

// =====================================================
// CONNECT CO-HOST TO HOST
// =====================================================

async function connectToHost() {

    if (!coHostStream || !currentStreamId || !currentInvitationId) {
        console.error("Missing co-host connection information.");
        return;
    }

    console.log("Connecting co-host to host...");

    coHostPeerConnection = new RTCPeerConnection(rtcConfig);

    const pc = coHostPeerConnection;

    const invitationRef = doc(
        db,
        "liveStreams",
        currentStreamId,
        "coHostInvitations",
        currentInvitationId
    );

    const coHostCandidatesRef = collection(
        db,
        "liveStreams",
        currentStreamId,
        "coHostInvitations",
        currentInvitationId,
        "coHostCandidates"
    );

    const hostCandidatesRef = collection(
        db,
        "liveStreams",
        currentStreamId,
        "coHostInvitations",
        currentInvitationId,
        "hostCoHostCandidates"
    );

    const pendingHostCandidates = [];

    // SEND CO-HOST CAMERA AND MICROPHONE TO HOST

    coHostStream.getTracks().forEach(track => {
        pc.addTrack(track, coHostStream);
    });

    // SEND ICE CANDIDATES TO FIRESTORE

    pc.onicecandidate = async event => {

        if (!event.candidate) return;

        try {

            await addDoc(
                coHostCandidatesRef,
                event.candidate.toJSON()
            );

        } catch (error) {

            console.error("Co-host ICE error:", error);

        }

    };

    // WATCH CONNECTION STATUS

    pc.onconnectionstatechange = () => {

        console.log(
            "Co-host connection state:",
            pc.connectionState
        );

        if (pc.connectionState === "connected") {

            coHostStatus.textContent =
                "Connected to the host successfully.";

        } else if (
            pc.connectionState === "disconnected" ||
            pc.connectionState === "failed"
        ) {

            coHostStatus.textContent =
                "Connection interrupted. Please check your internet.";

        }

    };

    try {

        // CREATE CO-HOST OFFER

        const offer = await pc.createOffer();

        await pc.setLocalDescription(offer);

        await updateDoc(invitationRef, {

            coHostOffer: {
                type: pc.localDescription.type,
                sdp: pc.localDescription.sdp
            },

            coHostOfferCreatedAt: serverTimestamp()

        });

        console.log("Co-host offer sent to host.");

        // RECEIVE HOST ANSWER

        unsubscribeCoHostAnswer = onSnapshot(
            invitationRef,
            async snapshot => {

                if (!snapshot.exists()) return;

                const data = snapshot.data();

                if (
                    data.coHostAnswer &&
                    !pc.remoteDescription &&
                    pc.signalingState !== "closed"
                ) {

                    try {

                        await pc.setRemoteDescription(
                            new RTCSessionDescription(data.coHostAnswer)
                        );

                        console.log("Host answer received.");

                        // ADD ANY ICE CANDIDATES THAT ARRIVED EARLY

                        for (const candidate of pendingHostCandidates) {

                            await pc.addIceCandidate(
                                new RTCIceCandidate(candidate)
                            );

                        }

                        pendingHostCandidates.length = 0;

                    } catch (error) {

                        console.error("Host answer error:", error);

                    }

                }

            }
        );

        // RECEIVE HOST ICE CANDIDATES

        unsubscribeHostCandidates = onSnapshot(
            hostCandidatesRef,
            async snapshot => {

                for (const change of snapshot.docChanges()) {

                    if (change.type !== "added") continue;

                    if (receivedHostCandidates.has(change.doc.id)) {
                        continue;
                    }

                    receivedHostCandidates.add(change.doc.id);

                    const candidate = change.doc.data();

                    try {

                        if (pc.remoteDescription) {

                            await pc.addIceCandidate(
                                new RTCIceCandidate(candidate)
                            );

                        } else {

                            pendingHostCandidates.push(candidate);

                        }

                    } catch (error) {

                        console.error(
                            "Host ICE candidate error:",
                            error
                        );

                    }

                }

            },
            error => {
                console.error("Host ICE listener error:", error);
            }
        );

        coHostStatus.textContent =
            "Connecting to the host...";

    } catch (error) {

        console.error("Could not connect to host:", error);

        coHostStatus.textContent =
            "Could not connect to the host. Please try again.";

    }

}

// =====================================================
// MICROPHONE
// =====================================================

coHostMicBtn.addEventListener("click", () => {

    if (!coHostStream) return;

    microphoneEnabled = !microphoneEnabled;

    coHostStream.getAudioTracks().forEach(track => {
        track.enabled = microphoneEnabled;
    });

    coHostMicBtn.textContent = microphoneEnabled
        ? "🎤 Microphone"
        : "🔇 Microphone Off";

});

// =====================================================
// CAMERA
// =====================================================

coHostCameraBtn.addEventListener("click", () => {

    if (!coHostStream) return;

    cameraEnabled = !cameraEnabled;

    coHostStream.getVideoTracks().forEach(track => {
        track.enabled = cameraEnabled;
    });

    coHostCameraBtn.textContent = cameraEnabled
        ? "📷 Camera"
        : "🚫 Camera Off";

});


// =====================================================
// LEAVE CO-HOST PAGE
// =====================================================

leaveCoHostBtn.addEventListener("click", async () => {

    // Stop listening for Firestore updates

    if (unsubscribeCoHostAnswer) {
        unsubscribeCoHostAnswer();
        unsubscribeCoHostAnswer = null;
    }

    if (unsubscribeHostCandidates) {
        unsubscribeHostCandidates();
        unsubscribeHostCandidates = null;
    }

    // Close WebRTC connection

    if (coHostPeerConnection) {
        coHostPeerConnection.close();
        coHostPeerConnection = null;
    }

    // Stop camera and microphone

    if (coHostStream) {

        coHostStream.getTracks().forEach(track => {
            track.stop();
        });

        coHostStream = null;
    }

    // Clear local video

    coHostLocalVideo.srcObject = null;

    // Update invitation status

    if (currentInvitationId && currentStreamId) {

        try {

            await updateDoc(
                doc(
                    db,
                    "liveStreams",
                    currentStreamId,
                    "coHostInvitations",
                    currentInvitationId
                ),
                {
                    status: "left",
                    leftAt: serverTimestamp()
                }
            );

        } catch (error) {

            console.error("Could not update co-host status:", error);

        }

    }

    coHostLiveSection.style.display = "none";

    invitationSection.style.display = "block";

    coHostStatus.textContent =
        "You left the co-host session.";

});
