
/* =====================================
   ALQLIC ADMIN CUSTOMER SUPPORT INBOX
===================================== */

import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
    collection,
    query,
    orderBy,
    onSnapshot,
    doc,
    updateDoc,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";


// ==========================================
// ADMIN CONFIGURATION
// ==========================================

const ADMIN_UID = "6YUXXXZSHLdZ1JCiYxvEmf2btg83";


// ==========================================
// PAGE ELEMENTS
// ==========================================

const requestsList = document.getElementById("requestsList");
const statusFilter = document.getElementById("statusFilter");

const totalRequests = document.getElementById("totalRequests");
const openRequests = document.getElementById("openRequests");
const progressRequests = document.getElementById("progressRequests");
const resolvedRequests = document.getElementById("resolvedRequests");

const backBtn = document.getElementById("backBtn");

let allRequests = [];

let messageUnsubscribers = [];


// ==========================================
// BACK BUTTON
// ==========================================

if (backBtn) {
    backBtn.addEventListener("click", () => {
        window.history.back();
    });
}


// ==========================================
// ADMIN AUTHENTICATION
// ==========================================

onAuthStateChanged(auth, (user) => {

    if (!user) {
        window.location.replace("login.html");
        return;
    }

    if (user.uid !== ADMIN_UID) {
        alert("Access denied. Administrator permission required.");
        window.location.replace("index.html");
        return;
    }

    console.log("AlQlic administrator verified.");

    loadSupportRequests();

});


// ==========================================
// STOP OLD MESSAGE LISTENERS
// ==========================================

function stopMessageListeners() {

    messageUnsubscribers.forEach((unsubscribe) => {
        unsubscribe();
    });

    messageUnsubscribers = [];

}


// ==========================================
// LOAD SUPPORT REQUESTS
// ==========================================

function loadSupportRequests() {

    const supportQuery = query(
        collection(db, "supportRequests"),
        orderBy("createdAt", "desc")
    );

    onSnapshot(
        supportQuery,

        (snapshot) => {

            allRequests = snapshot.docs.map((requestDoc) => ({
                id: requestDoc.id,
                ...requestDoc.data()
            }));

            updateSummary();
            displayRequests();

        },

        (error) => {

            console.error(
                "Error loading support requests:",
                error
            );

            requestsList.textContent =
                "Unable to load customer requests. Check administrator permissions.";

        }
    );

}


// ==========================================
// UPDATE SUMMARY
// ==========================================

function updateSummary() {

    totalRequests.textContent = allRequests.length;

    openRequests.textContent = allRequests.filter(
        request => request.status === "open"
    ).length;

    progressRequests.textContent = allRequests.filter(
        request => request.status === "in-progress"
    ).length;

    resolvedRequests.textContent = allRequests.filter(
        request => request.status === "resolved"
    ).length;

}


// ==========================================
// DISPLAY SUPPORT REQUESTS
// ==========================================

function displayRequests() {

    stopMessageListeners();

    const selectedStatus = statusFilter.value;

    const filteredRequests = selectedStatus === "all"
        ? allRequests
        : allRequests.filter(
            request => request.status === selectedStatus
        );

    requestsList.replaceChildren();

    if (filteredRequests.length === 0) {

        const empty = document.createElement("p");

        empty.textContent = "No customer requests found.";

        requestsList.appendChild(empty);

        return;
    }

    filteredRequests.forEach((request) => {

        const card = document.createElement("div");

        card.className = "support-request";


        // ==================================
        // CUSTOMER DETAILS
        // ==================================

        const name = document.createElement("h3");

        name.className = "request-name";

        name.textContent =
            request.name || "Unknown User";


        const email = document.createElement("p");

        email.className = "request-email";

        email.textContent =
            request.email || "No email provided";


        const subject = document.createElement("p");

        subject.className = "request-subject";

        subject.textContent =
            "Subject: " + (request.subject || "No subject");


        const originalMessage = document.createElement("p");

        originalMessage.className = "request-message";

        originalMessage.textContent =
            request.message || "No message";


        const date = document.createElement("p");

        date.className = "request-date";

        date.textContent =
            request.createdAt &&
            typeof request.createdAt.toDate === "function"
                ? request.createdAt.toDate().toLocaleString()
                : "Date unavailable";


        // ==================================
        // STATUS SELECT
        // ==================================

        const statusSelect = document.createElement("select");

        statusSelect.className = "status-select";

        const statuses = [
            ["open", "Open"],
            ["in-progress", "In Progress"],
            ["resolved", "Resolved"]
        ];

        statuses.forEach(([value, label]) => {

            const option = document.createElement("option");

            option.value = value;

            option.textContent = label;

            statusSelect.appendChild(option);

        });

        statusSelect.value = request.status || "open";


        statusSelect.addEventListener("change", async () => {

            const newStatus = statusSelect.value;

            statusSelect.disabled = true;

            try {

                await updateDoc(
                    doc(db, "supportRequests", request.id),
                    {
                        status: newStatus
                    }
                );

            } catch (error) {

                console.error(
                    "Error updating request status:",
                    error
                );

                alert("Unable to update request status.");

                statusSelect.value = request.status || "open";

            } finally {

                statusSelect.disabled = false;

            }

        });


        // ==================================
        // CONVERSATION SECTION
        // ==================================

        const chatSection = document.createElement("div");

        chatSection.className = "admin-chat-section";


        const chatHeading = document.createElement("h4");

        chatHeading.textContent =
            "Conversation with Customer";


        const messagesContainer =
            document.createElement("div");

        messagesContainer.className =
            "admin-chat-messages";


        // ==================================
        // DISPLAY OLD ADMIN REPLY
        // ==================================

        if (request.adminReply) {

            const oldReply = createMessageBubble(
                request.adminReply,
                "admin",
                request.repliedAt
            );

            messagesContainer.appendChild(oldReply);

        }


        // ==================================
        // MESSAGE INPUT
        // ==================================

        const messageInput =
            document.createElement("textarea");

        messageInput.className = "admin-chat-input";

        messageInput.placeholder =
            "Write a message to this customer...";

        messageInput.rows = 3;


        const sendButton = document.createElement("button");

        sendButton.type = "button";

        sendButton.className = "admin-chat-send";

        sendButton.textContent = "Send Message";


        const feedback = document.createElement("p");

        feedback.className = "admin-chat-feedback";


        chatSection.append(
            chatHeading,
            messagesContainer,
            messageInput,
            sendButton,
            feedback
        );


        // ==================================
        // ADD EVERYTHING TO CARD
        // ==================================

        card.append(
            name,
            email,
            subject,
            originalMessage,
            date,
            statusSelect,
            chatSection
        );

        requestsList.appendChild(card);


        // ==================================
        // LOAD LIVE CONVERSATION
        // ==================================

        const messagesQuery = query(
            collection(
                db,
                "supportRequests",
                request.id,
                "messages"
            ),
            orderBy("createdAt", "asc")
        );


        const unsubscribe = onSnapshot(
            messagesQuery,

            (snapshot) => {

                messagesContainer.replaceChildren();

                // Preserve replies sent before the chat upgrade.
                if (request.adminReply) {

                    messagesContainer.appendChild(
                        createMessageBubble(
                            request.adminReply,
                            "admin",
                            request.repliedAt
                        )
                    );

                }

                snapshot.forEach((messageDoc) => {

                    const message = messageDoc.data();

                    messagesContainer.appendChild(
                        createMessageBubble(
                            message.message,
                            message.senderRole,
                            message.createdAt
                        )
                    );

                });

                messagesContainer.scrollTop =
                    messagesContainer.scrollHeight;

            },

            (error) => {

                console.error(
                    "Error loading conversation:",
                    error
                );

                feedback.textContent =
                    "Unable to load conversation messages.";

            }
        );

        messageUnsubscribers.push(unsubscribe);


        // ==================================
        // SEND ADMIN MESSAGE
        // ==================================

        sendButton.addEventListener("click", async () => {

            const messageText = messageInput.value.trim();

            if (!messageText) {

                feedback.textContent =
                    "Please type a message first.";

                return;

            }

            if (messageText.length > 5000) {

                feedback.textContent =
                    "Message cannot exceed 5000 characters.";

                return;

            }

            sendButton.disabled = true;

            sendButton.textContent = "Sending...";

            feedback.textContent = "";

            try {

                await addDoc(
                    collection(
                        db,
                        "supportRequests",
                        request.id,
                        "messages"
                    ),
                    {
                        message: messageText,
                        senderId: auth.currentUser.uid,
                        senderRole: "admin",
                        createdAt: serverTimestamp()
                    }
                );

                messageInput.value = "";

                feedback.textContent =
                    "Message sent successfully.";

            } catch (error) {

                console.error(
                    "Error sending admin message:",
                    error
                );

                feedback.textContent =
                    "Unable to send message. Please try again.";

            } finally {

                sendButton.disabled = false;

                sendButton.textContent = "Send Message";

            }

        });

    });

}


// ==========================================
// CREATE CHAT MESSAGE
// ==========================================

function createMessageBubble(message, senderRole, timestamp) {

    const bubble = document.createElement("div");

    bubble.className =
        senderRole === "admin"
            ? "admin-chat-message admin-message"
            : "admin-chat-message customer-message";

    const sender = document.createElement("strong");

    sender.textContent =
        senderRole === "admin"
            ? "AlQlic Support"
            : "Customer";

    const text = document.createElement("p");

    text.textContent = message || "";

    bubble.append(sender, text);

    if (
        timestamp &&
        typeof timestamp.toDate === "function"
    ) {

        const date = document.createElement("small");

        date.textContent =
            timestamp.toDate().toLocaleString();

        bubble.appendChild(date);

    }

    return bubble;

}


// ==========================================
// FILTER REQUESTS
// ==========================================

if (statusFilter) {

    statusFilter.addEventListener("change", () => {
        displayRequests();
    });

}
