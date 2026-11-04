import { auth } from "./firebase.js";

const applyCreatorBtn =
    document.getElementById("applyCreatorBtn");

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

                window.location.href = "login.html";
                return;
            }

            // Open the Monetization Application page
            window.location.href =
                "creator-application.html";
        }
    );
}
