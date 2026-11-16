/* =====================================
   ALQLIC CONTACT & SUPPORT FORM
===================================== */

import { auth, db } from "./firebase.js";

import {
    collection,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";


document.addEventListener(
    "DOMContentLoaded",
    function () {

        // =====================================
        // GET PAGE ELEMENTS
        // =====================================

        const contactForm =
            document.getElementById("contactForm");

        const formMessage =
            document.getElementById("formMessage");

        const backBtn =
            document.getElementById("backBtn");


        // =====================================
        // BACK BUTTON
        // =====================================

        if (backBtn) {

            backBtn.addEventListener(
                "click",
                () => {

                    window.history.back();

                }
            );

        }


        // Stop if the form does not exist
        if (!contactForm) {
            return;
        }


        // =====================================
        // SUBMIT SUPPORT REQUEST
        // =====================================

        contactForm.addEventListener(
            "submit",
            async function (event) {

                event.preventDefault();


                const name =
                    contactForm.elements["name"]
                        .value
                        .trim();

                const email =
                    contactForm.elements["email"]
                        .value
                        .trim();

                const subject =
                    contactForm.elements["subject"]
                        .value
                        .trim();

                const message =
                    contactForm.elements["message"]
                        .value
                        .trim();


                // Validate all fields
                if (
                    !name ||
                    !email ||
                    !subject ||
                    !message
                ) {

                    showMessage(
                        "Please complete all fields.",
                        "error"
                    );

                    return;

                }


                // Validate email
                if (
                    !contactForm
                        .elements["email"]
                        .checkValidity()
                ) {

                    showMessage(
                        "Please enter a valid email address.",
                        "error"
                    );

                    return;

                }

               // Require users to be logged in
if (!auth.currentUser) {

    showMessage(
        "Please log in to your AlQlic account before contacting support.",
        "error"
    );

    return;

}


                try {

                    // Disable button while sending
                    const submitButton =
                        contactForm.querySelector(
                            'button[type="submit"]'
                        );

                    submitButton.disabled = true;

                    submitButton.textContent =
                        "Sending...";


                    // =====================================
                    // SAVE SUPPORT REQUEST TO FIRESTORE
                    // =====================================

                    await addDoc(
                        collection(
                            db,
                            "supportRequests"
                        ),
                        {

                            name: name,

                            email: email,

                            subject: subject,

                            message: message,

                            // Logged-in user ID, if available
                           userId: auth.currentUser.uid,

                            status: "open",

                            createdAt:
                                serverTimestamp()

                        }
                    );


                    // Success message
                    showMessage(
                        "Your support request has been sent successfully. The AlQlic support team will review it.",
                        "success"
                    );


                    // Clear the form
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

                    // Re-enable button
                    const submitButton =
                        contactForm.querySelector(
                            'button[type="submit"]'
                        );

                    submitButton.disabled = false;

                    submitButton.textContent =
                        "Send Message";

                }

            }
        );


        // =====================================
        // SHOW FORM MESSAGE
        // =====================================

        function showMessage(
            message,
            type
        ) {

            if (!formMessage) {

                alert(message);
                return;

            }

            formMessage.textContent =
                message;

            formMessage.className =
                type;

        }

    }
);
