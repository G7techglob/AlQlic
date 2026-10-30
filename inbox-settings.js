
import { auth, db } from "./firebase.js";

import {
    doc,
    getDoc,
    setDoc,
    collection,
    getDocs,
    deleteDoc,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const receiverUid = params.get("uid");

const pinChatText = document.getElementById("pinChatText");
const archiveChatBtn = document.getElementById("archiveChat");

function getChatId() {
    const user = auth.currentUser;

    if (!user || !receiverUid) return null;

    return [user.uid, receiverUid].sort().join("_");
}

async function updatePinButton() {
    const user = auth.currentUser;

    if (!user || !receiverUid) return;

    const settingsSnap = await getDoc(
        doc(db, "chatSettings", user.uid + "_" + receiverUid)
    );

    if (
        settingsSnap.exists() &&
        settingsSnap.data().pinned === true
    ) {
        pinChatText.textContent = "Unpin Chat";
    } else {
        pinChatText.textContent = "Pin Chat";
    }
}

document.getElementById("backBtn").onclick = () => {
    history.back();
};

document.getElementById("viewProfile").onclick = () => {
    window.location.href = `user.html?uid=${receiverUid}`;
};

document.getElementById("muteChat").onclick = async () => {
    const user = auth.currentUser;

    if (!user) return;

    await setDoc(
        doc(db, "chatSettings", user.uid + "_" + receiverUid),
        {
            muted: true
        },
        { merge: true }
    );

    alert("Notifications muted for this chat.");
};

document.getElementById("pinChat").onclick = async () => {
    const user = auth.currentUser;

    if (!user) return;

    const settingsRef = doc(
        db,
        "chatSettings",
        user.uid + "_" + receiverUid
    );

    const settingsSnap = await getDoc(settingsRef);

    let pinned = false;

    if (settingsSnap.exists()) {
        pinned = settingsSnap.data().pinned === true;
    }

    const newPinnedState = !pinned;

    await setDoc(
        settingsRef,
        {
            pinned: newPinnedState
        },
        { merge: true }
    );

    pinChatText.textContent = newPinnedState
        ? "Unpin Chat"
        : "Pin Chat";

    alert(
        newPinnedState
            ? "Chat pinned successfully."
            : "Chat unpinned successfully."
    );
};

// ARCHIVE CHAT
if (archiveChatBtn) {
    archiveChatBtn.onclick = async () => {
        const user = auth.currentUser;

        if (!user || !receiverUid) {
            alert("Please sign in before archiving a chat.");
            return;
        }

        const confirmArchive = confirm(
            "Move this conversation to Archived Chats?"
        );

        if (!confirmArchive) return;

        try {
            const chatId = getChatId();

            if (!chatId) return;

            const archiveRef = doc(
                db,
                "archivedChats",
                user.uid + "_" + chatId
            );

            await setDoc(archiveRef, {
                userId: user.uid,
                chatId: chatId,
                otherUserId: receiverUid,
                isGroup: false,
                archivedAt: serverTimestamp()
            });

            alert("Chat archived successfully.");

            window.location.href = "chats.html";

        } catch (error) {
            console.error("Archive error:", error);
            alert("Unable to archive this chat. Please try again.");
        }
    };
}

document.getElementById("clearChat").onclick = async () => {
    const user = auth.currentUser;

    if (!user) return;

    const confirmClear = confirm(
        "Are you sure you want to clear this chat?"
    );

    if (!confirmClear) return;

    const chatId = getChatId();

    const messagesRef = collection(db, "chats", chatId, "messages");

    const snapshot = await getDocs(messagesRef);

    for (const message of snapshot.docs) {
        await deleteDoc(message.ref);
    }

    alert("Chat cleared successfully.");

    history.back();
};

document.getElementById("deleteChat").onclick = async () => {
    const user = auth.currentUser;

    if (!user) return;

    const confirmDelete = confirm(
        "Delete this conversation? This cannot be undone."
    );

    if (!confirmDelete) return;

    const chatId = getChatId();

    const messagesRef = collection(db, "chats", chatId, "messages");
    const snapshot = await getDocs(messagesRef);

    for (const message of snapshot.docs) {
        await deleteDoc(message.ref);
    }

    await deleteDoc(
        doc(db, "chatSettings", user.uid + "_" + receiverUid)
    );

    alert("Conversation deleted.");

    window.location.href = "chats.html";
};

document.getElementById("blockUser").onclick = async () => {
    const confirmBlock = confirm(
        "Block this user? You won't be able to send messages to each other."
    );

    if (!confirmBlock) return;

    const user = auth.currentUser;

    if (!user) return;

    await setDoc(
        doc(db, "blockedUsers", user.uid + "_" + receiverUid),
        {
            blockerId: user.uid,
            blockedId: receiverUid,
            blockedAt: new Date()
        }
    );

    alert("User blocked successfully.");

    window.location.href = "chats.html";
};

document.getElementById("reportUser").onclick = async () => {
    const confirmReport = confirm(
        "Report this user for inappropriate behavior?"
    );

    if (!confirmReport) return;

    const user = auth.currentUser;

    if (!user) return;

    await addDoc(collection(db, "reports"), {
        reporterId: user.uid,
        reportedUserId: receiverUid,
        createdAt: new Date(),
        status: "pending"
    });

    alert("Thank you. Your report has been submitted.");
};

updatePinButton();
