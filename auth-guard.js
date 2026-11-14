
import { auth } from "./firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// Prevent page content from appearing before authentication is checked
document.documentElement.style.visibility = "hidden";

onAuthStateChanged(auth, async (user) => {

    // User is not logged in
    if (!user) {
        window.location.replace("login.html");
        return;
    }

    try {

        // Refresh Firebase user information
        await user.reload();

        const currentUser = auth.currentUser;

        // Check whether the email is verified
        if (!currentUser || !currentUser.emailVerified) {
            window.location.replace("verify-email.html");
            return;
        }

        // Allow verified users to view the page
        document.documentElement.style.visibility = "visible";

        console.log("AlQlic authentication verified.");

    } catch (error) {

        console.error("Authentication guard error:", error);

        await signOut(auth);

        window.location.replace("login.html");

    }

});
