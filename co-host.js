
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

// =====================================================
// ALQLIC LIVE — CO-HOST
// =====================================================

const $ = id => document.getElementById(id);

const invitationSection = $("invitationSection");
const invitationMessage = $("invitationMessage");
const acceptInviteBtn = $("acceptInviteBtn");
const declineInviteBtn = $("declineInviteBtn");

const coHostLiveSection = $("coHostLiveSection");
const coHostLocalVideo = $("coHostLocalVideo");
const coHostMicBtn = $("coHostMicBtn");
const coHostCameraBtn = $("coHostCameraBtn");
const leaveCoHostBtn = $("leaveCoHostBtn");
const coHostStatus = $("coHostStatus");

const rtcConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};

let currentUser = null;
let currentInvitation = null;
let currentInvitationId = null;
let currentStreamId = null;

let localStream = null;
let peerConnection = null;

let unsubscribeHostCandidates = null;
let unsubscribeInvitation = null;

let micEnabled = true;
let cameraEnabled = true;
let busy = false;
let leaving = false;

const seenHostCandidates = new Set();

function setStatus(message) {
    if (coHostStatus) coHostStatus.textContent = message;
    console.log("[AlQlic Co-host]", message);
}

function showInvitation(message) {
    if (invitationMessage) invitationMessage.textContent = message;
}

function stopLocalMedia() {
    if (localStream) {
        localStream.getTracks().forEach(track => {
            try {
                track.stop();
            } catch (_) {}
        });
    }

    localStream = null;

    if (coHostLocalVideo) {
        coHostLocalVideo.srcObject = null;
    }
}

function closeConnection() {
    if (peerConnection) {
        try {
            peerConnection.onicecandidate = null;
            peerConnection.ontrack = null;
            peerConnection.onconnectionstatechange = null;
            peerConnection.close();
        } catch (_) {}
    }

    peerConnection = null;
}

function stopInvitationListeners() {
    if (unsubscribeHostCandidates) {
        unsubscribeHostCandidates();
        unsubscribeHostCandidates = null;
    }

    if (unsubscribeInvitation) {
        unsubscribeInvitation();
        unsubscribeInvitation = null;
    }
}

function getInvitationRef() {
    return doc(
        db,
        "liveStreams",
        currentStreamId,
        "coHostInvitations",
        currentInvitationId
    );
}

// =====================================================
// FIND PENDING INVITATION
// =====================================================

async function findPendingInvitation(user) {
    try {
        const streamsSnapshot = await getDocs(
            query(
                collection(db, "liveStreams"),
                where("status", "==", "live")
            )
        );

        for (const streamDoc of streamsSnapshot.docs) {
            const invitationsRef = collection(
                db,
                "liveStreams",
                streamDoc.id,
                "coHostInvitations"
            );

            const invitationsSnapshot = await getDocs(
                query(
                    invitationsRef,
                    where("invitedUserId", "==", user.uid),
                    where("status", "==", "pending"),
                    limit(1)
                )
            );

            if (!invitationsSnapshot.empty) {
                const invitationDoc = invitationsSnapshot.docs[0];

                return {
                    streamId: streamDoc.id,
                    invitationId: invitationDoc.id,
                    data: invitationDoc.data()
                };
            }
        }

        return null;

    } catch (error) {
        console.error("Invitation search failed:", error);
        throw error;
    }
}

// =====================================================
// AUTHENTICATION
// =====================================================

onAuthStateChanged(auth, async user => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    currentUser = user;

    try {
        showInvitation("Checking for live invitations...");

        const invitation = await findPendingInvitation(user);

        if (!invitation) {
            showInvitation("You have no pending co-host invitations.");
            if (invitationSection) invitationSection.hidden = false;
            return;
        }

        currentStreamId = invitation.streamId;
        currentInvitationId = invitation.invitationId;
        currentInvitation = invitation.data;

        showInvitation(
            `${currentInvitation.hostName || "The host"} invited you to join a live stream.`
        );

        if (invitationSection) invitationSection.hidden = false;

        listenForInvitationStatus();

    } catch (error) {
        console.error(error);
        showInvitation("Could not check invitations. Please refresh.");
    }
});

// =====================================================
// ACCEPT INVITATION
// =====================================================

if (acceptInviteBtn) {
    acceptInviteBtn.addEventListener("click", acceptInvitation);
}

async function acceptInvitation() {
    if (busy || !currentInvitation || !currentInvitationId) return;
    busy = true;

    try {
        setStatus("Requesting camera and microphone...");

        localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: {
                facingMode: "user",
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });

        if (coHostLocalVideo) {
            coHostLocalVideo.srcObject = localStream;
            coHostLocalVideo.muted = true;
            coHostLocalVideo.playsInline = true;
            coHostLocalVideo.play().catch(() => {});
        }

        const invitationRef = getInvitationRef();

        peerConnection = new RTCPeerConnection(rtcConfig);

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        peerConnection.onicecandidate = async event => {
            if (!event.candidate) return;

            try {
                await addDoc(
                    collection(invitationRef, "coHostCandidates"),
                    event.candidate.toJSON()
                );
            } catch (error) {
                console.error("Co-host ICE write failed:", error);
            }
        };

        peerConnection.onconnectionstatechange = () => {
            const state = peerConnection?.connectionState;

            setStatus(`Connection: ${state}`);

            if (state === "connected") {
                if (invitationSection) invitationSection.hidden = true;
                if (coHostLiveSection) coHostLiveSection.hidden = false;
                setStatus("You are connected to the live stream.");
            }

            if (state === "failed") {
                setStatus("Connection failed. Please leave and try again.");
            }
        };

        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: false,
            offerToReceiveVideo: false
        });

        await peerConnection.setLocalDescription(offer);

        await updateDoc(invitationRef, {
            status: "accepted",
            coHostOffer: peerConnection.localDescription.toJSON(),
            coHostId: currentUser.uid,
            coHostUsername: currentUser.displayName || "",
            acceptedAt: serverTimestamp()
        });

        listenForHostAnswer();
        listenForHostCandidates();

        if (invitationSection) invitationSection.hidden = true;
        if (coHostLiveSection) coHostLiveSection.hidden = false;

        setStatus("Waiting for the host to connect...");

    } catch (error) {
        console.error("Accept invitation failed:", error);
        setStatus("Could not join. Check camera permissions and try again.");
        stopLocalMedia();
        closeConnection();
    } finally {
        busy = false;
    }
}

// =====================================================
// RECEIVE HOST ANSWER
// =====================================================

function listenForHostAnswer() {
    if (unsubscribeInvitation) unsubscribeInvitation();

    unsubscribeInvitation = onSnapshot(
        getInvitationRef(),
        async snapshot => {
            if (!snapshot.exists() || !peerConnection) return;

            const data = snapshot.data();

            if (data.status === "left" || data.status === "ended") {
                setStatus("The co-host session has ended.");
                await cleanupLocalSession(false);
                return;
            }

            if (
                data.coHostAnswer &&
                peerConnection.signalingState === "have-local-offer" &&
                !peerConnection.currentRemoteDescription
            ) {
                try {
                    await peerConnection.setRemoteDescription(
                        new RTCSessionDescription(data.coHostAnswer)
                    );

                    setStatus("Host answer received. Connecting...");
                } catch (error) {
                    console.error("Applying host answer failed:", error);
                }
            }
        }
    );
}

// =====================================================
// RECEIVE HOST ICE CANDIDATES
// =====================================================

function listenForHostCandidates() {
    if (unsubscribeHostCandidates) {
        unsubscribeHostCandidates();
        unsubscribeHostCandidates = null;
    }

    const candidatesRef = collection(
        getInvitationRef(),
        "hostCoHostCandidates"
    );

    unsubscribeHostCandidates = onSnapshot(
        candidatesRef,
        async snapshot => {
            if (!peerConnection || !peerConnection.remoteDescription) return;

            for (const change of snapshot.docChanges()) {
                if (change.type !== "added") continue;

                const candidateId = change.doc.id;
                if (seenHostCandidates.has(candidateId)) continue;

                seenHostCandidates.add(candidateId);

                try {
                    await peerConnection.addIceCandidate(
                        new RTCIceCandidate(change.doc.data())
                    );
                } catch (error) {
                    console.warn("Host ICE candidate error:", error);
                }
            }
        }
    );
}

// =====================================================
// DECLINE INVITATION
// =====================================================

if (declineInviteBtn) {
    declineInviteBtn.addEventListener("click", declineInvitation);
}

async function declineInvitation() {
    if (!currentInvitationId || !currentStreamId) return;

    try {
        await updateDoc(getInvitationRef(), {
            status: "declined",
            declinedAt: serverTimestamp()
        });

        showInvitation("Invitation declined.");

    } catch (error) {
        console.error("Decline failed:", error);
        showInvitation("Could not decline the invitation.");
    }
}

// =====================================================
// MICROPHONE CONTROL
// =====================================================

if (coHostMicBtn) {
    coHostMicBtn.addEventListener("click", () => {
        micEnabled = !micEnabled;

        if (localStream) {
            localStream.getAudioTracks().forEach(track => {
                track.enabled = micEnabled;
            });
        }

        coHostMicBtn.textContent = micEnabled ? "Mute" : "Unmute";
    });
}

// =====================================================
// CAMERA CONTROL
// =====================================================

if (coHostCameraBtn) {
    coHostCameraBtn.addEventListener("click", () => {
        cameraEnabled = !cameraEnabled;

        if (localStream) {
            localStream.getVideoTracks().forEach(track => {
                track.enabled = cameraEnabled;
            });
        }

        coHostCameraBtn.textContent = cameraEnabled
            ? "Turn camera off"
            : "Turn camera on";
    });
}

// =====================================================
// LISTEN FOR INVITATION STATUS
// =====================================================

function listenForInvitationStatus() {
    if (unsubscribeInvitation) unsubscribeInvitation();

    unsubscribeInvitation = onSnapshot(
        getInvitationRef(),
        async snapshot => {
            if (!snapshot.exists()) return;

            const data = snapshot.data();

            if (
                data.status === "declined" ||
                data.status === "ended" ||
                data.status === "left"
            ) {
                setStatus("This invitation is no longer active.");
                await cleanupLocalSession(false);
            }
        }
    );
}

// =====================================================
// LEAVE CO-HOST SESSION
// =====================================================

if (leaveCoHostBtn) {
    leaveCoHostBtn.addEventListener("click", leaveCoHostSession);
}

async function leaveCoHostSession() {
    if (leaving) return;
    leaving = true;

    try {
        if (currentInvitationId && currentStreamId) {
            await updateDoc(getInvitationRef(), {
                status: "left",
                leftAt: serverTimestamp()
            });
        }
    } catch (error) {
        console.error("Updating co-host leave status failed:", error);
    }

    await cleanupLocalSession(false);
    setStatus("You left the live stream.");

    if (invitationSection) invitationSection.hidden = false;
    if (coHostLiveSection) coHostLiveSection.hidden = true;

    leaving = false;
}

async function cleanupLocalSession(updateStatus = false) {
    stopInvitationListeners();
    closeConnection();
    stopLocalMedia();

    if (updateStatus && currentInvitationId && currentStreamId) {
        try {
            await updateDoc(getInvitationRef(), {
                status: "left",
                leftAt: serverTimestamp()
            });
        } catch (_) {}
    }

    if (coHostLiveSection) coHostLiveSection.hidden = true;
}

// =====================================================
// PAGE CLEANUP
// =====================================================

window.addEventListener("pagehide", () => {
    stopInvitationListeners();
    closeConnection();
    stopLocalMedia();
});

window.addEventListener("beforeunload", () => {
    stopInvitationListeners();
    closeConnection();
    stopLocalMedia();
});
