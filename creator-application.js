import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const form = document.getElementById(
    "creatorApplicationForm"
);

const creatorName = document.getElementById(
    "creatorName"
);

const creatorUsername = document.getElementById(
    "creatorUsername"
);

const contentType = document.getElementById(
    "contentType"
);

const creatorDescription = document.getElementById(
    "creatorDescription"
);

const socialLink = document.getElementById(
    "socialLink"
);

const submitBtn = document.getElementById(
    "submitApplicationBtn"
);

// ===============================
// CHECK LOGIN AND LOAD PROFILE
// ===============================

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        alert(
            "Please log in before applying for monetization."
        );

        window.location.href = "login.html";
        return;
    }

    try {

        // Get the user's existing AlQlic profile
        const userRef = doc(
            db,
            "users",
            user.uid
        );

        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {

            const data = userDoc.data();

            // Automatically fill in name and username
            creatorName.value =
                data.name || "";

            creatorUsername.value =
                data.username || "";
        }

        // Check if the user has already applied
        const applicationRef = doc(
            db,
            "creatorApplications",
            user.uid
        );

        const applicationDoc =
            await getDoc(applicationRef);

        if (applicationDoc.exists()) {

            const application =
                applicationDoc.data();

            if (application.status === "pending") {

                alert(
                    "Your monetization application is already pending review."
                );

                submitBtn.textContent =
                    "Application Pending";

                submitBtn.disabled = true;
            }

            if (application.status === "approved") {

                alert(
                    "You are already an approved AlQlic Creator."
                );

                submitBtn.textContent =
                    "Approved Creator";

                submitBtn.disabled = true;
            }
        }

    } catch (error) {

        console.error(
            "Error loading application:",
            error
        );
    }
});

// ===============================
// SUBMIT APPLICATION
// ===============================

if (form) {

    form.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();

            const user =
                auth.currentUser;

            if (!user) {

                alert(
                    "Please log in again before submitting."
                );

                window.location.href =
                    "login.html";

                return;
            }

            const name =
                creatorName.value.trim();

            const username =
                creatorUsername.value.trim();

            const type =
                contentType.value;

            const description =
                creatorDescription.value.trim();

            const social =
                socialLink.value.trim();

            if (
                !name ||
                !username ||
                !type ||
                !description
            ) {

                alert(
                    "Please complete all required fields."
                );

                return;
            }

            try {

                submitBtn.disabled = true;

                submitBtn.textContent =
                    "Submitting...";

                // Save application to Firebase
                await setDoc(
                    doc(
                        db,
                        "creatorApplications",
                        user.uid
                    ),
                    {
                        userId: user.uid,
                        name: name,
                        username: username,
                        email: user.email || "",
                        contentType: type,
                        description: description,
                        socialLink: social,
                        status: "pending",
                        appliedAt: serverTimestamp()
                    }
                );

                alert(
                    "Your monetization application has been submitted successfully!"
                );

                window.location.href =
                    "creators.html";

            } catch (error) {

                console.error(
                    "Application submission error:",
                    error
                );

                alert(
                    "Unable to submit your application. Please try again."
                );

                submitBtn.disabled = false;

                submitBtn.textContent =
                    "Submit Application";
            }
        }
    );
}
