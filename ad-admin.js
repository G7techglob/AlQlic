
/* =========================================
   ALQLIC ADVERTISEMENT ADMIN
========================================= */

document.addEventListener("DOMContentLoaded", function () {

    const adminMessage = document.getElementById("adminMessage");

    // Advertising system settings
    const billboardSettings = {
        totalSlots: 7,
        rotationMinutes: 20,
        subscriptionDays: 30
    };

    // Display the current system configuration
    if (adminMessage) {
        adminMessage.textContent =
            "System settings: " +
            billboardSettings.totalSlots +
            " billboard slots, one advert displayed at a time, " +
            "rotation every " +
            billboardSettings.rotationMinutes +
            " minutes, and a paid advertising period of one month.";
    }

    console.log("AlQlic Advertisement Admin loaded.");
    console.log("Billboard settings:", billboardSettings);

});
