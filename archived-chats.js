
import { auth, db } from "./firebase.js";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    deleteDoc,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";


const archivedChatsList =
    document.getElementById("archivedChatsList");


// ===============================
// EMPTY STATE
// ===============================

function showEmpty() {

    archivedChatsList.innerHTML = `
        <div class="empty-state">
            <i class="fa-solid fa-box-archive"></i>
            <h3>No archived chats yet</h3>
            <p>Chats you archive will appear here.</p>
        </div>
    `;

}


// ===============================
// LOADING
// ===============================

function showLoading() {

    archivedChatsList.innerHTML = `
        <div class="empty-state">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <p>Loading archived chats...</p>
        </div>
    `;

}


// ===============================
// TIME FORMAT
// ===============================

function formatTime(timestamp) {

    if (!timestamp) return "";

    const date = timestamp.toDate();

    return date.toLocaleString([], {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
    });

}


// ===============================
// LOAD ARCHIVED CHATS
// ===============================

onAuthStateChanged(auth, async (user) => {

    if (!user) {
        location.href = "login.html";
        return;
    }

    showLoading();

    try {

        const archiveQuery = query(
            collection(db, "archivedChats"),
            where("userId", "==", user.uid)
        );

        const archiveSnapshot =
            await getDocs(archiveQuery);

        if (archiveSnapshot.empty) {
            showEmpty();
            return;
        }

        let archivedChats = [];

        for (const archiveDoc of archiveSnapshot.docs) {

            const archive = archiveDoc.data();

            let name = "User";
            let photo = "images/default-avatar.png";
            let message = "No messages yet";
            let time = null;

            // ===============================
            // GROUP CHAT
            // ===============================

            if (archive.isGroup === true) {

                const groupSnap = await getDoc(
                    doc(db, "groups", archive.groupId)
                );

                if (groupSnap.exists()) {

                    const group = groupSnap.data();

                    name = group.name || "Group";

                    photo =
                        group.photoURL ||
                        "images/default-avatar.png";

                }

                const messagesQuery = query(
                    collection(
                        db,
                        "groups",
                        archive.groupId,
                        "messages"
                    ),
                    orderBy("time", "desc"),
                    limit(1)
                );

                const messagesSnap =
                    await getDocs(messagesQuery);

                if (!messagesSnap.empty) {

                    const last =
                        messagesSnap.docs[0].data();

                    message =
                        last.text || "📷 Image";

                    time = last.time;

                }

            }

            // ===============================
            // INDIVIDUAL CHAT
            // ===============================

            else {

                const otherUserSnap = await getDoc(
                    doc(db, "users", archive.otherUserId)
                );

                if (otherUserSnap.exists()) {

                    const otherUser =
                        otherUserSnap.data();

                    name =
                        otherUser.name ||
                        otherUser.username ||
                        "User";

                    photo =
                        otherUser.photoURL ||
                        "images/default-avatar.png";

                }

                const messagesQuery = query(
                    collection(
                        db,
                        "chats",
                        archive.chatId,
                        "messages"
                    ),
                    orderBy("time", "desc"),
                    limit(1)
                );

                const messagesSnap =
                    await getDocs(messagesQuery);

                if (!messagesSnap.empty) {

                    const last =
                        messagesSnap.docs[0].data();

                    message =
                        last.text || "📷 Image";

                    time = last.time;

                }

            }

            archivedChats.push({

                archiveId: archiveDoc.id,

                archive: archive,

                name: name,

                photo: photo,

                message: message,

                time: time

            });

        }


        // Sort newest archived first

        archivedChats.sort((a, b) => {

            const timeA =
                a.archive.archivedAt?.seconds || 0;

            const timeB =
                b.archive.archivedAt?.seconds || 0;

            return timeB - timeA;

        });


        archivedChatsList.innerHTML = "";


        // ===============================
        // DISPLAY ARCHIVED CHATS
        // ===============================

        archivedChats.forEach(chat => {

            const item = document.createElement("div");

            item.className = "chat-item";

            const avatar = document.createElement("img");

            avatar.className = "avatar";
            avatar.src = chat.photo;
            avatar.alt = chat.name;

            const main = document.createElement("div");

            main.className = "chat-main";

            const top = document.createElement("div");

            top.className = "chat-top";

            const chatName = document.createElement("p");

            chatName.className = "chat-name";
            chatName.textContent = chat.name;

            const chatTime = document.createElement("p");

            chatTime.className = "chat-time";
            chatTime.textContent = formatTime(chat.time);

            top.append(chatName, chatTime);

            const chatMessage = document.createElement("p");

            chatMessage.className = "chat-message";
            chatMessage.textContent = chat.message;

            main.append(top, chatMessage);


            // UNARCHIVE BUTTON

            const unarchiveBtn =
                document.createElement("button");

            unarchiveBtn.className = "unarchive-btn";

            unarchiveBtn.textContent = "Unarchive";


            unarchiveBtn.onclick = async (event) => {

                event.stopPropagation();

                const confirmed = confirm(
                    "Restore this conversation to your chats?"
                );

                if (!confirmed) return;

                try {

                    await deleteDoc(
                        doc(
                            db,
                            "archivedChats",
                            chat.archiveId
                        )
                    );

                    item.remove();

                    if (
                        archivedChatsList.children.length === 0
                    ) {
                        showEmpty();
                    }

                } catch (error) {

                    console.error(
                        "Unarchive error:",
                        error
                    );

                    alert("Unable to unarchive this chat.");

                }

            };


            item.append(
                avatar,
                main,
                unarchiveBtn
            );

            item.onclick = () => {

                if (chat.archive.isGroup === true) {

                    location.href =
                        `group-chat.html?groupId=${encodeURIComponent(chat.archive.groupId)}`;

                } else {

                    location.href =
                        `chat.html?uid=${encodeURIComponent(chat.archive.otherUserId)}`;

                }

            };

            archivedChatsList.appendChild(item);

        });


    } catch (error) {

        console.error(
            "Archived chats loading error:",
            error
        );

        archivedChatsList.innerHTML = `
            <div class="empty-state">
                <h3>Unable to load archived chats</h3>
                <p>Please try again later.</p>
            </div>
        `;

    }

});
