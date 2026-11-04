import { auth, db } from "./firebase.js";

import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const applyCreatorBtn =
    document.getElementById("applyCreatorBtn");

if (applyCreatorBtn) {

    applyCreatorBtn.addEventListener(
        "click",
        async () => {

            const user = auth.currentUser;

            // Check if the user is logged in
            if (!user) {
                alert(
                    "Please log in before applying for monetization."
                );

                window.location.href = "login.html";
                return;
            }

            try {

                // Check if the user has already applied
                const applicationRef = doc(
                    db,
                    "creatorApplications",
                    user.uid
                );

                const existingApplication =
                    await getDoc(applicationRef);

                if (existingApplication.exists()) {

                    const data =
                        existingApplication.data();

                    if (data.status === "pending") {
                        alert(
                            "Your monetization application is already pending review."
                        );
                        return;
                    }

                    if (data.status === "approved") {
                        alert(
                            "Congratulations! You are already an approved AlQlic Creator."
                        );
                        return;
                    }
                }

                // Get the user's profile information
                const userRef =
                    doc(db, "users", user.uid);

                const userDoc =
                    await getDoc(userRef);

                const userData =
                    userDoc.exists()
                        ? userDoc.data()
                        : {};

                // Save the application
                await setDoc(applicationRef, {

                    userId: user.uid,

                    name:
                        userData.name ||
                        "Unknown User",

                    username:
                        userData.username ||
                        "",

                    email:
                        user.email ||
                        userData.email ||
                        "",

                    status: "pending",

                    appliedAt:
                        serverTimestamp()

                });

                alert(
                    "Your application has been submitted successfully! AlQlic will review your application."
                );

                // Change button text
                applyCreatorBtn.textContent =
                    "Application Pending";

                applyCreatorBtn.disabled = true;

            } catch (error) {

                console.error(
                    "Creator application error:",
                    error
                );

                alert(
                    "Unable to submit your application. Please try again."
                );
            }
        }
    );
}
