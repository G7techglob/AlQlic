
/* =====================================
   ALQLIC CONTACT FORM
===================================== */

document.addEventListener("DOMContentLoaded", function () {
    const contactForm = document.getElementById("contactForm");
    const formMessage = document.getElementById("formMessage");

    if (!contactForm) {
        return;
    }

    contactForm.addEventListener("submit", function (event) {
        event.preventDefault();

        const name = contactForm.elements["name"].value.trim();
        const email = contactForm.elements["email"].value.trim();
        const subject = contactForm.elements["subject"].value.trim();
        const message = contactForm.elements["message"].value.trim();

        if (!name || !email || !subject || !message) {
            showMessage("Please complete all fields.", "error");
            return;
        }

        if (!contactForm.elements["email"].checkValidity()) {
            showMessage("Please enter a valid email address.", "error");
            return;
        }

        /*
         * Email delivery will be connected in the next step.
         * This code validates the form but does not send an email.
         */

        showMessage(
            "Your message has been checked, but email delivery is not connected yet. Please email officialalqlic@gmail.com directly for now.",
            "info"
        );
    });

    function showMessage(message, type) {
        if (!formMessage) {
            alert(message);
            return;
        }

        formMessage.textContent = message;
        formMessage.className = type;
    }
});
