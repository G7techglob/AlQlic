import { auth, db } from "./firebase.js";

import {
    collection,
    query,
    orderBy,
    onSnapshot,
    doc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";


// ==========================================
// ADMIN SUPPORT PAGE
// ==========================================

const requestsList =
    document.getElementById("requestsList");

const statusFilter =
    document.getElementById("statusFilter");

const totalRequests =
    document.getElementById("totalRequests");

const openRequests =
    document.getElementById("openRequests");

const progressRequests =
    document.getElementById("progressRequests");

const resolvedRequests =
    document.getElementById("resolvedRequests");

const backBtn =
    document.getElementById("backBtn");

let allRequests = [];


// ==========================================
// BACK BUTTON
// ==========================================

backBtn.addEventListener("click", () => {

    window.history.back();

});


// ==========================================
// ADMIN AUTHENTICATION CHECK
// ==========================================

auth.onAuthStateChanged((user) => {

    if (!user) {

        // No logged-in user
        window.location.href = "login.html";
        return;

    }

    // Load support requests after login
    loadSupportRequests();

});


// ==========================================
// LOAD SUPPORT REQUESTS
// ==========================================

function loadSupportRequests() {

    const supportQuery =
        query(
            collection(
                db,
                "supportRequests"
            ),
            orderBy(
                "createdAt",
                "desc"
            )
        );


    onSnapshot(
        supportQuery,

        (snapshot) => {

            allRequests =
                snapshot.docs.map(
                    (requestDoc) => ({

                        id:
                            requestDoc.id,

                        ...requestDoc.data()

                    })
                );


            updateSummary();

            displayRequests();

        },

        (error) => {

            console.error(
                "Error loading support requests:",
                error
            );

            requestsList.innerHTML =
                `
                <p class="error-message">
                    Unable to load customer requests.
                </p>
                `;

        }

    );

}


// ==========================================
// UPDATE SUMMARY
// ==========================================

function updateSummary() {

    const total =
        allRequests.length;

    const open =
        allRequests.filter(
            (request) =>
                request.status === "open"
        ).length;

    const inProgress =
        allRequests.filter(
            (request) =>
                request.status === "in-progress"
        ).length;

    const resolved =
        allRequests.filter(
            (request) =>
                request.status === "resolved"
        ).length;


    totalRequests.textContent =
        total;

    openRequests.textContent =
        open;

    progressRequests.textContent =
        inProgress;

    resolvedRequests.textContent =
        resolved;

}


// ==========================================
// DISPLAY SUPPORT REQUESTS
// ==========================================

function displayRequests() {

    const selectedStatus =
        statusFilter.value;


    const filteredRequests =
        selectedStatus === "all"

            ? allRequests

            : allRequests.filter(
                (request) =>
                    request.status === selectedStatus
            );


    if (
        filteredRequests.length === 0
    ) {

        requestsList.innerHTML =
            `
            <p class="empty-message">
                No customer requests found.
            </p>
            `;

        return;

    }


    requestsList.innerHTML =
        "";


    filteredRequests.forEach(
        (request) => {

            const requestCard =
                document.createElement(
                    "div"
                );

            requestCard.className =
                "support-request";


            // Format request date
            let formattedDate =
                "Date unavailable";

            if (
                request.createdAt
            ) {

                formattedDate =
                    request.createdAt
                        .toDate()
                        .toLocaleString();

            }


            requestCard.innerHTML =
                `
                <div class="request-top">

                    <div>

                        <h3 class="request-name">
                            ${escapeHTML(
                                request.name ||
                                "Unknown User"
                            )}
                        </h3>

                        <p class="request-email">
                            ${escapeHTML(
                                request.email ||
                                "No email provided"
                            )}
                        </p>

                    </div>

                </div>


                <p class="request-subject">
                    Subject: ${escapeHTML(
                        request.subject ||
                        "No subject"
                    )}
                </p>


                <p class="request-message">
                    ${escapeHTML(
                        request.message ||
                        "No message"
                    )}
                </p>


                <div class="request-footer">

                    <span class="request-date">
                        ${formattedDate}
                    </span>


                    <select
                        class="status-select"
                        data-id="${request.id}"
                    >

                        <option
                            value="open"
                            ${
                                request.status === "open"
                                    ? "selected"
                                    : ""
                            }
                        >
                            Open
                        </option>

                        <option
                            value="in-progress"
                            ${
                                request.status ===
                                "in-progress"
                                    ? "selected"
                                    : ""
                            }
                        >
                            In Progress
                        </option>

                        <option
                            value="resolved"
                            ${
                                request.status ===
                                "resolved"
                                    ? "selected"
                                    : ""
                            }
                        >
                            Resolved
                        </option>

                    </select>

                </div>
                `;


            requestsList.appendChild(
                requestCard
            );

        }
    );


    // Add status change listeners
    document
        .querySelectorAll(
            ".status-select"
        )
        .forEach(
            (select) => {

                select.addEventListener(
                    "change",
                    async () => {

                        try {

                            await updateDoc(
                                doc(
                                    db,
                                    "supportRequests",
                                    select.dataset.id
                                ),

                                {
                                    status:
                                        select.value
                                }

                            );

                        } catch (error) {

                            console.error(
                                "Error updating status:",
                                error
                            );

                            alert(
                                "Unable to update request status."
                            );

                        }

                    }
                );

            }
        );

}


// ==========================================
// FILTER REQUESTS
// ==========================================

statusFilter.addEventListener(
    "change",
    () => {

        displayRequests();

    }
);


// ==========================================
// PROTECT AGAINST HTML INJECTION
// ==========================================

function escapeHTML(value) {

    const div =
        document.createElement(
            "div"
        );

    div.textContent =
        value;

    return div.innerHTML;

}
