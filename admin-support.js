
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
    updateDoc
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

    // Only the authorised administrator can continue.
    if (user.uid !== ADMIN_UID) {
        alert("Access denied. Administrator permission required.");
        window.location.replace("index.html");
        return;
    }

    console.log("AlQlic administrator verified.");

    loadSupportRequests();

});


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

            console.error("Error loading support requests:", error);

            requestsList.innerHTML = `
                <p class="error-message">
                    Unable to load customer requests.
                    Please check your administrator permissions.
                </p>
            `;

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

    const selectedStatus = statusFilter.value;

    const filteredRequests = selectedStatus === "all"
        ? allRequests
        : allRequests.filter(
            request => request.status === selectedStatus
        );

    if (filteredRequests.length === 0) {

        requestsList.innerHTML = `
            <p class="empty-message">
                No customer requests found.
            </p>
        `;

        return;
    }

    requestsList.innerHTML = "";

    filteredRequests.forEach((request) => {

        const requestCard = document.createElement("div");

        requestCard.className = "support-request";

        let formattedDate = "Date unavailable";

        if (
            request.createdAt &&
            typeof request.createdAt.toDate === "function"
        ) {
            formattedDate = request.createdAt.toDate().toLocaleString();
        }

        requestCard.innerHTML = `
            <div class="request-top">
                <div>

                    <h3 class="request-name">
                        ${escapeHTML(request.name || "Unknown User")}
                    </h3>

                    <p class="request-email">
                        ${escapeHTML(request.email || "No email provided")}
                    </p>

                </div>
            </div>

            <p class="request-subject">
                Subject: ${escapeHTML(request.subject || "No subject")}
            </p>

            <p class="request-message">
                ${escapeHTML(request.message || "No message")}
            </p>

            <div class="request-footer">

                <span class="request-date">
                    ${escapeHTML(formattedDate)}
                </span>

                <select class="status-select">

                    <option value="open"
                        ${request.status === "open" ? "selected" : ""}>
                        Open
                    </option>

                    <option value="in-progress"
                        ${request.status === "in-progress" ? "selected" : ""}>
                        In Progress
                    </option>

                    <option value="resolved"
                        ${request.status === "resolved" ? "selected" : ""}>
                        Resolved
                    </option>

                </select>

            </div>
        `;

        requestsList.appendChild(requestCard);

        const statusSelect = requestCard.querySelector(".status-select");

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

                console.log("Support request status updated.");

            } catch (error) {

                console.error("Error updating request status:", error);

                alert("Unable to update request status.");

                statusSelect.value = request.status;

            } finally {

                statusSelect.disabled = false;

            }

        });

    });

}


// ==========================================
// FILTER REQUESTS
// ==========================================

if (statusFilter) {

    statusFilter.addEventListener("change", () => {
        displayRequests();
    });

}


// ==========================================
// PROTECT AGAINST HTML INJECTION
// ==========================================

function escapeHTML(value) {

    const div = document.createElement("div");

    div.textContent = String(value);

    return div.innerHTML;

}
