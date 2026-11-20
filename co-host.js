
import { auth, db } from "./firebase.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
    doc,
    getDoc,
    updateDoc,
    collection,
    query,
    where,
    limit,
    onSnapshot,
    serverTimestamp
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

let unsubscribeInvitations = null;

// =====================================================
// WAIT FOR LOGIN
// =====================================================

auth.onAuthStateChanged(async (user) => {

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

        coHostStatus.textContent =
            "Camera and microphone are ready. Connecting to the host will be the next step.";

    } catch (error) {

        console.error("Co-host camera error:", error);

        coHostStatus.textContent =
            "Could not access camera or microphone. Check browser permissions.";

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

leaveCoHostBtn.addEventListener("click", () => {

    if (coHostStream) {

        coHostStream.getTracks().forEach(track => {
            track.stop();
        });

        coHostStream = null;

    }

    coHostLocalVideo.srcObject = null;

    coHostLiveSection.style.display = "none";

    invitationSection.style.display = "block";

    coHostStatus.textContent = "You left the co-host session.";

});
