
/* =====================================
   ALQLIC CONTACT & SUPPORT FORM
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

    if (user) {
        loadMySupportRequests(user.uid);
    } else if (mySupportRequests) {

        mySupportRequests.textContent =
            "Please log in to view your support messages.";

    }

});


// =====================================
// LOAD CUSTOMER SUPPORT REQUESTS
// =====================================

function loadMySupportRequests(userId) {

    if (!mySupportRequests) return;

    mySupportRequests.textContent =
        "Loading your support messages...";

    const supportQuery = query(
        collection(db, "supportRequests"),
        where("userId", "==", userId),
        orderBy("createdAt", "desc")
    );

    onSnapshot(
        supportQuery,

        (snapshot) => {

            mySupportRequests.replaceChildren();

            if (snapshot.empty) {

                const emptyMessage =
                    document.createElement("p");

                emptyMessage.textContent =
                    "You have not submitted any support requests yet.";

                mySupportRequests.appendChild(emptyMessage);

                return;
            }

            snapshot.forEach((requestDoc) => {

                const request = requestDoc.data();

                const card =
                    document.createElement("div");

                card.className = "customer-support-card";


                // Original message

                const subject =
                    document.createElement("h4");

                subject.textContent =
                    request.subject || "Support Request";

                const message =
                    document.createElement("p");

                message.textContent =
                    request.message || "";

                const status =
                    document.createElement("p");

                status.className = "customer-support-status";

                status.textContent =
                    "Status: " +
                    (request.status || "open");


                card.appendChild(subject);
                card.appendChild(message);
                card.appendChild(status);


                // Admin reply

                const replySection =
                    document.createElement("div");

                replySection.className =
                    "customer-admin-reply";

                const replyHeading =
                    document.createElement("h4");

                replyHeading.textContent =
                    "AlQlic Support Reply";

                replySection.appendChild(replyHeading);


                if (request.adminReply) {

                    const replyText =
                        document.createElement("p");

                    replyText.textContent =
                        request.adminReply;

                    replySection.appendChild(replyText);


                    if (
                        request.repliedAt &&
                        typeof request.repliedAt.toDate === "function"
                    ) {

                        const replyDate =
                            document.createElement("small");

                        replyDate.textContent =
                            "Replied: " +
                            request.repliedAt.toDate().toLocaleString();

                        replySection.appendChild(replyDate);

                    }

                } else {

                    const waitingMessage =
                        document.createElement("p");

                    waitingMessage.textContent =
                        "Our support team has not replied yet. Please check back later.";

                    replySection.appendChild(waitingMessage);

                }


                card.appendChild(replySection);

                mySupportRequests.appendChild(card);

            });

        },

        (error) => {

            console.error(
                "Error loading customer support requests:",
                error
            );

            mySupportRequests.textContent =
                "Unable to load your support messages. Please refresh the page.";

        }

    );

}


// =====================================
// SUBMIT SUPPORT REQUEST
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


        // Validate fields

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
                "Please log in to your AlQlic account before contacting support.",
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

                    name: name,

                    email: email,

                    subject: subject,

                    message: message,

                    userId: currentUser.uid,

                    status: "open",

                    createdAt: serverTimestamp()

                }
            );


            showMessage(
                "Your support request has been sent successfully. The AlQlic support team will review it.",
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
