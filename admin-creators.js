import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
    collection,
    getDocs,
    doc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const loadingMessage =
    document.getElementById("loadingMessage");

const applicationsContainer =
    document.getElementById(
        "applicationsContainer"
    );

// ===============================
// LOAD ADMIN PAGE
// ===============================

onAuthStateChanged(auth, async (user) => {

    console.log("Admin email:", user?.email);
console.log("Admin UID:", user?.uid);
    
    // User must be logged in
    if (!user) {

        alert("Please log in first.");

        window.location.href = "login.html";

        return;
    }

    try {

        const applicationsRef =
            collection(
                db,
                "creatorApplications"
            );

        const snapshot =
            await getDocs(applicationsRef);

        // Hide loading message
        if (loadingMessage) {
            loadingMessage.style.display =
                "none";
        }

        if (!applicationsContainer) {
            return;
        }

        applicationsContainer.innerHTML = "";

        // No applications yet
        if (snapshot.empty) {

            applicationsContainer.innerHTML = `
                <p class="loading-message">
                    No creator applications yet.
                </p>
            `;

            return;
        }

        // Show every application
        snapshot.forEach(
            (applicationDoc) => {

                const application =
                    applicationDoc.data();

                const card =
                    document.createElement("div");

                card.className =
                    "application-card";

                card.innerHTML = `
                    <h2>
                        ${application.name || "Unknown User"}
                    </h2>

                    <p>
                        <strong>Username:</strong>
                        ${application.username || "Not provided"}
                    </p>

                    <p>
                        <strong>Email:</strong>
                        ${application.email || "Not provided"}
                    </p>

                    <p>
                        <strong>Content Type:</strong>
                        ${application.contentType || "Not provided"}
                    </p>

                    <p>
                        <strong>Description:</strong>
                        ${application.description || "Not provided"}
                    </p>

                    <p>
                        <strong>Social Link:</strong>
                        ${application.socialLink || "Not provided"}
                    </p>

                    <p>
                        <strong>Status:</strong>
                        <span class="application-status">
                            ${application.status || "pending"}
                        </span>
                    </p>

                    <div class="application-actions">

                        <button
                            class="approve-btn"
                            data-id="${applicationDoc.id}"
                        >
                            Approve
                        </button>

                        <button
                            class="reject-btn"
                            data-id="${applicationDoc.id}"
                        >
                            Reject
                        </button>

                    </div>
                `;

                applicationsContainer.appendChild(
                    card
                );
            }
        );

    } catch (error) {

        console.error(
            "Error loading applications:",
            error
        );

        if (loadingMessage) {

            loadingMessage.textContent =
                "Unable to load applications.";
        }
    }
});

// ===============================
// APPROVE OR REJECT APPLICATION
// ===============================

applicationsContainer.addEventListener(
    "click",
    async (event) => {

        const button = event.target;

        // Check if Approve button was clicked
        if (
            button.classList.contains(
                "approve-btn"
            )
        ) {

            const applicationId =
                button.dataset.id;

            try {

                await updateDoc(
                    doc(
                        db,
                        "creatorApplications",
                        applicationId
                    ),
                    {
                        status: "approved"
                    }
                );

                alert(
                    "Creator application approved!"
                );

                // Reload the page to show
                // the new status
                window.location.reload();

            } catch (error) {

                console.error(
                    "Error approving application:",
                    error
                );

                alert(
                    "Unable to approve application."
                );
            }
        }

        // Check if Reject button was clicked
        if (
            button.classList.contains(
                "reject-btn"
            )
        ) {

            const applicationId =
                button.dataset.id;

            try {

                await updateDoc(
                    doc(
                        db,
                        "creatorApplications",
                        applicationId
                    ),
                    {
                        status: "rejected"
                    }
                );

                alert(
                    "Creator application rejected."
                );

                // Reload the page to show
                // the new status
                window.location.reload();

            } catch (error) {

                console.error(
                    "Error rejecting application:",
                    error
                );

                alert(
                    "Unable to reject application."
                );
            }
        }
    }
);
