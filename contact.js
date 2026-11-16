
/* =====================================
   ALQLIC CUSTOMER SUPPORT INBOX
===================================== */

import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
    collection,
    addDoc,
    serverTimestamp,
    query,
    where,
    orderBy,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";


// =====================================
// PAGE ELEMENTS
// =====================================

const contactForm = document.getElementById("contactForm");
const formMessage = document.getElementById("formMessage");
const backBtn = document.getElementById("backBtn");

const mySupportRequests =
    document.getElementById("mySupportRequests");

let currentUser = null;
let requestUnsubscribe = null;
let messageUnsubscribers = [];


// =====================================
// BACK BUTTON
// =====================================

if (backBtn) {
    backBtn.addEventListener("click", () => {
        window.history.back();
    });
}


// =====================================
// AUTHENTICATION
// =====================================

onAuthStateChanged(auth, (user) => {

    currentUser = user;

    if (requestUnsubscribe) {
        requestUnsubscribe();
        requestUnsubscribe = null;
    }

    stopMessageListeners();

    if (user) {
        loadMySupportRequests(user.uid);
    } else if (mySupportRequests) {
        mySupportRequests.textContent =
            "Please log in to view your support conversations.";
    }

});


// =====================================
// STOP MESSAGE LISTENERS
// =====================================

function stopMessageListeners() {

    messageUnsubscribers.forEach((unsubscribe) => {
        unsubscribe();
    });

    messageUnsubscribers = [];

}


// =====================================
// LOAD CUSTOMER REQUESTS
// =====================================

function loadMySupportRequests(userId) {

    if (!mySupportRequests) return;

    mySupportRequests.textContent =
        "Loading your support inbox...";

    const supportQuery = query(
        collection(db, "supportRequests"),
        where("userId", "==", userId),
        orderBy("createdAt", "desc")
    );

    requestUnsubscribe = onSnapshot(
        supportQuery,

        (snapshot) => {

            stopMessageListeners();

            mySupportRequests.replaceChildren();

            if (snapshot.empty) {

                const empty = document.createElement("p");

                empty.textContent =
                    "You have no support conversations yet.";

                mySupportRequests.appendChild(empty);

                return;
            }

            snapshot.forEach((requestDoc) => {

                const request = requestDoc.data();

                const requestId = requestDoc.id;

                createConversationCard(
                    requestId,
                    request
                );

            });

        },

        (error) => {

            console.error(
                "Error loading support inbox:",
                error
            );

            mySupportRequests.textContent =
                "Unable to load your support inbox. Please refresh the page.";

        }
    );

}


// =====================================
// CREATE CONVERSATION CARD
// =====================================

function createConversationCard(requestId, request) {

    const card = document.createElement("div");

    card.className = "customer-support-card";

    const heading = document.createElement("h3");

    heading.textContent =
        request.subject || "Support Request";

    const originalMessage = document.createElement("div");

    originalMessage.className = "customer-chat-message customer-message";

    const originalLabel = document.createElement("strong");

    originalLabel.textContent = "You";

    const originalText = document.createElement("p");

    originalText.textContent = request.message || "";

    originalMessage.append(
        originalLabel,
        originalText
    );

    const status = document.createElement("p");

    status.className = "customer-support-status";

    status.textContent =
        "Status: " + (request.status || "open");

    const conversationTitle = document.createElement("h4");

    conversationTitle.textContent =
        "Conversation with AlQlic Support";

    const messagesContainer = document.createElement("div");

    messagesContainer.className = "support-chat-messages";

    // Display the old administrator reply if one exists.
    // This preserves replies sent before the inbox upgrade.

    if (request.adminReply) {

        const oldReply = createMessageBubble(
            request.adminReply,
            "admin",
            request.repliedAt
        );

        messagesContainer.appendChild(oldReply);

    }

    const input = document.createElement("textarea");

    input.className = "support-chat-input";

    input.placeholder =
        "Write a message to AlQlic Support...";

    input.rows = 3;

    const sendButton = document.createElement("button");

    sendButton.type = "button";

    sendButton.className = "support-chat-send";

    sendButton.textContent = "Send Message";

    const feedback = document.createElement("p");

    feedback.className = "support-chat-feedback";

    card.append(
        heading,
        originalMessage,
        status,
        conversationTitle,
        messagesContainer,
        input,
        sendButton,
        feedback
    );

    mySupportRequests.appendChild(card);


    // =================================
    // LOAD LIVE CONVERSATION
    // =================================

    const messagesQuery = query(
        collection(
            db,
            "supportRequests",
            requestId,
            "messages"
        ),
        orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(
        messagesQuery,

        (snapshot) => {

            messagesContainer.replaceChildren();

            // Preserve the previous single admin reply.
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


    // =================================
    // SEND CUSTOMER MESSAGE
    // =================================

    sendButton.addEventListener("click", async () => {

        const messageText = input.value.trim();

        if (!messageText) {

            feedback.textContent =
                "Please type a message first.";

            return;

        }

        if (messageText.length > 5000) {

            feedback.textContent =
                "Your message cannot exceed 5000 characters.";

            return;

        }

        if (!currentUser) {

            feedback.textContent =
                "Please log in again.";

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
                    requestId,
                    "messages"
                ),
                {
                    message: messageText,
                    senderId: currentUser.uid,
                    senderRole: "customer",
                    createdAt: serverTimestamp()
                }
            );

            input.value = "";

            feedback.textContent =
                "Message sent successfully.";

        } catch (error) {

            console.error(
                "Error sending customer message:",
                error
            );

            feedback.textContent =
                "Unable to send your message. Please try again.";

        } finally {

            sendButton.disabled = false;

            sendButton.textContent = "Send Message";

        }

    });

}


// =====================================
// CREATE CHAT MESSAGE
// =====================================

function createMessageBubble(message, senderRole, timestamp) {

    const bubble = document.createElement("div");

    bubble.className =
        senderRole === "admin"
            ? "customer-chat-message admin-message"
            : "customer-chat-message customer-message";

    const sender = document.createElement("strong");

    sender.textContent =
        senderRole === "admin"
            ? "AlQlic Support"
            : "You";

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


// =====================================
// SUBMIT NEW SUPPORT REQUEST
// =====================================

if (contactForm) {

    contactForm.addEventListener("submit", async (event) => {

        event.preventDefault();

        const name =
            contactForm.elements["name"].value.trim();

        const email =
            contactForm.elements["email"].value.trim();

        const subject =
            contactForm.elements["subject"].value.trim();

        const message =
            contactForm.elements["message"].value.trim();

        if (!name || !email || !subject || !message) {

            showMessage(
                "Please complete all fields.",
                "error"
            );

            return;

        }

        if (!contactForm.elements["email"].checkValidity()) {

            showMessage(
                "Please enter a valid email address.",
                "error"
            );

            return;

        }

        if (!currentUser) {

            showMessage(
                "Please log in before contacting support.",
                "error"
            );

            return;

        }

        const submitButton =
            contactForm.querySelector('button[type="submit"]');

        submitButton.disabled = true;

        submitButton.textContent = "Sending...";

        try {

            await addDoc(
                collection(db, "supportRequests"),
                {
                    name,
                    email,
                    subject,
                    message,
                    userId: currentUser.uid,
                    status: "open",
                    createdAt: serverTimestamp()
                }
            );

            showMessage(
                "Your support request has been sent successfully. You can continue the conversation in My Support Requests below.",
                "success"
            );

            contactForm.reset();

        } catch (error) {

            console.error(
                "Support request error:",
                error
            );

            showMessage(
                "Unable to send your request. Please try again.",
                "error"
            );

        } finally {

            submitButton.disabled = false;

            submitButton.textContent = "Send Message";

        }

    });

}


// =====================================
// SHOW FORM MESSAGE
// =====================================

function showMessage(message, type) {

    if (!formMessage) {
        alert(message);
        return;
    }

    formMessage.textContent = message;

    formMessage.className = type;

}
