```javascript
/* =========================================
   ALQLIC MARKETPLACE BILLBOARD ADMIN
========================================= */

document.addEventListener("DOMContentLoaded", function () {

    // Billboard configuration
    const billboardSettings = {
        totalSlots: 7,
        rotationMinutes: 20,
        subscriptionDays: 30
    };

    // Admin page elements
    const adminMessage = document.getElementById("adminMessage");
    const advertisementList =
        document.getElementById("advertisementList");

    // Display billboard settings
    if (adminMessage) {
        adminMessage.textContent =
            "Billboard configuration: " +
            billboardSettings.totalSlots +
            " advertising slots, one advert displayed at a time, " +
            "rotation every " +
            billboardSettings.rotationMinutes +
            " minutes, and a " +
            billboardSettings.subscriptionDays +
            "-day subscription.";
    }

    // Display the seven billboard slots
    if (advertisementList) {

        advertisementList.innerHTML = "";

        for (let slot = 1;
             slot <= billboardSettings.totalSlots;
             slot++) {

            const slotCard = document.createElement("div");
            slotCard.className = "location";

            const heading = document.createElement("h3");
            heading.textContent =
                "Marketplace Billboard Slot " + slot;

            const description = document.createElement("p");
            description.textContent =
                "Ready for an advertisement to be assigned.";

            const status = document.createElement("span");
            status.className = "status";
            status.textContent = "Slot " + slot + " — Unassigned";

            slotCard.appendChild(heading);
            slotCard.appendChild(description);
            slotCard.appendChild(status);

            advertisementList.appendChild(slotCard);
        }
    }

    console.log("AlQlic Marketplace Billboard Admin loaded.");
    console.log("Billboard settings:", billboardSettings);

});
```
