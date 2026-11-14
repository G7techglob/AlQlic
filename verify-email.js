
import { auth } from "./firebase.js";

import {
    sendEmailVerification,
    reload,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";


const resendBtn = document.getElementById("resendBtn");
const message = document.getElementById("message");

const verifyBtn = document.querySelector(
    'button[onclick="checkVerification()"]'
);

let currentUser = null;
let authReady = false;


// WAIT FOR FIREBASE LOGIN STATUS

onAuthStateChanged(auth, (user) => {

    currentUser = user;
    authReady = true;

    if (!user) {
        message.textContent =
            "Please log in to your AlQlic account before verifying your email.";

        resendBtn.disabled = true;
        if (verifyBtn) verifyBtn.disabled = true;

        return;
    }

    resendBtn.disabled = false;
    if (verifyBtn) verifyBtn.disabled = false;

    message.textContent =
        `Verification email is for ${user.email}`;

});


// RESEND VERIFICATION EMAIL

resendBtn.addEventListener("click", async () => {

    if (!authReady || !currentUser) {
        message.textContent =
            "Please log in first.";

        return;
    }

    try {

        resendBtn.disabled = true;

        await sendEmailVerification(currentUser);

        message.textContent =
            "Verification email sent. Please check your Gmail inbox.";

    } catch (error) {

        console.error("Resend verification error:", error);

        message.textContent =
            error.message;

    } finally {

        resendBtn.disabled = false;

    }

});


// CHECK EMAIL VERIFICATION

async function checkVerification() {

    if (!authReady || !currentUser) {
        message.textContent =
            "Please log in first.";

        return;
    }

    try {

        await reload(currentUser);

        if (auth.currentUser.emailVerified) {

            message.textContent =
                "Email verified successfully! Welcome to AlQlic.";

            setTimeout(() => {

                window.location.href = "index.html";

            }, 1500);

        } else {

            message.textContent =
                "Your email is not verified yet. Please check Gmail and click the verification link.";

        }

    } catch (error) {

        console.error("Verification check error:", error);

        message.textContent =
            error.message;

    }

}


// CONNECT VERIFICATION BUTTON

if (verifyBtn) {

    verifyBtn.addEventListener("click", checkVerification);

}
