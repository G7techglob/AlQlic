import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const applyCreatorBtn =
    document.getElementById("applyCreatorBtn");

// ===============================
// CHECK CREATOR APPLICATION STATUS
// ===============================

onAuthStateChanged(auth, async (user) => {

    if (!applyCreatorBtn) {
        return;
    }

    // User is not logged in
    if (!user) {

        applyCreatorBtn.textContent =
            "Apply for Monetization";

        return;
    }

    try {

        // Check Firebase for this user's application
        const applicationRef = doc(
            db,
            "creatorApplications",
            user.uid
        );

        const applicationDoc =
            await getDoc(applicationRef);

        // If the user has an application
        if (applicationDoc.exists()) {

            const application =
                applicationDoc.data();

            // Application is waiting for review
            if (application.status === "pending") {

                applyCreatorBtn.textContent =
                    "Application Pending";

                applyCreatorBtn.disabled = true;

                return;
            }

            // Application was approved
            if (application.status === "approved") {

                applyCreatorBtn.textContent =
                    "Approved Creator";

                applyCreatorBtn.disabled = true;

                return;
            }
        }

    } catch (error) {

        console.error(
            "Error checking creator application:",
            error
        );
    }
});

// ===============================
// APPLY BUTTON
// ===============================

if (applyCreatorBtn) {

    applyCreatorBtn.addEventListener(
        "click",
        () => {

            const user = auth.currentUser;

            // Check if the user is logged in
            if (!user) {

                alert(
                    "Please log in before applying for monetization."
                );

                window.location.href =
                    "login.html";

                return;
            }

            // Open the Monetization Application page
            window.location.href =
                "creator-application.html";
        }
    );
}
