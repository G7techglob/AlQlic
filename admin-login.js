import { auth } from "./firebase.js";

import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// AlQlic administrator account
const adminEmail =
    "matchconnect9@gmail.com";

const adminLoginForm =
    document.getElementById(
        "adminLoginForm"
    );

const loginMessage =
    document.getElementById(
        "loginMessage"
    );

// Check whether an administrator is already logged in
onAuthStateChanged(auth, async (user) => {

    if (user && user.email === adminEmail) {

        window.location.href =
            "admin-creators.html";
    }
});

// Handle administrator login
adminLoginForm.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        const email =
            document
                .getElementById("adminEmail")
                .value
                .trim();

        const password =
            document
                .getElementById("adminPassword")
                .value;

        loginMessage.textContent =
            "Signing in...";

        try {

            const userCredential =
                await signInWithEmailAndPassword(
                    auth,
                    email,
                    password
                );

            const user =
                userCredential.user;

            // Only allow the AlQlic administrator
            if (user.email !== adminEmail) {

                await signOut(auth);

                loginMessage.textContent =
                    "Access denied. This account is not an administrator.";

                return;
            }

            loginMessage.textContent =
                "Login successful. Opening admin area...";

            window.location.href =
                "admin-creators.html";

        } catch (error) {

            console.error(
                "Admin login error:",
                error
            );

            loginMessage.textContent =
                "Unable to sign in. Check your email and password.";
        }
    }
);
