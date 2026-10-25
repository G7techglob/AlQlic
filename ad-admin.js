```javascript
/* =========================================
   ALQLIC MARKETPLACE BILLBOARD ADMIN
========================================= */

document.addEventListener("DOMContentLoaded", function () {

    const billboardSettings = {
        totalSlots: 7,
        rotationMinutes: 20,
        subscriptionDays: 30
    };

    const adminMessage =
        document.getElementById("adminMessage");

    const advertisementList =
        document.getElementById("advertisementList");

    const advertisementForm =
        document.getElementById("advertisementForm");

    const formMessage =
        document.getElementById("formMessage");

    const slotNumber =
        document.getElementById("slotNumber");

    const advertTitle =
        document.getElementById("advertTitle");

    const advertImage =
        document.getElementById("advertImage");

    const advertDestination =
        document.getElementById("advertDestination");

    // Temporary browser-session storage.
    // This is not permanent database storage.
    const advertisements = {};

    if (adminMessage) {
        adminMessage.textContent =
            "Billboard: 7 slots | Rotation: 20 minutes | " +
            "Subscription: 30 days. " +
            "Only paid and approved adverts should be published.";
    }

    function renderSlots() {

        if (!advertisementList) return;

        advertisementList.replaceChildren();

        for (
            let slot = 1;
            slot <= billboardSettings.totalSlots;
            slot++
        ) {

            const advert = advertisements[slot];

            const card = document.createElement("div");
            card.className = "location";

            const heading = document.createElement("h3");
            heading.textContent =
                "Marketplace Billboard Slot " + slot;

            card.appendChild(heading);

            if (advert) {

                const title = document.createElement("p");
                title.textContent = "Title: " + advert.title;
                card.appendChild(title);

                const image = document.createElement("img");
                image.src = advert.image;
                image.alt = advert.title;
                image.style.maxWidth = "220px";
                image.style.height = "auto";
                image.style.display = "block";

                image.addEventListener("error", function () {
                    image.alt = "Image could not be loaded";
                });

                card.appendChild(image);

                const destination = document.createElement("p");
                destination.textContent =
                    "Destination: " + advert.destination;
                card.appendChild(destination);

                const status = document.createElement("span");
                status.className = "status";
                status.textContent =
                    "Prepared — not yet published";
                card.appendChild(status);

                const removeButton =
                    document.createElement("button");

                removeButton.type = "button";
                removeButton.textContent =
                    "Remove from this temporary preview";

                removeButton.addEventListener("click", function () {
                    delete advertisements[slot];
                    renderSlots();

                    if (formMessage) {
                        formMessage.textContent =
                            "The temporary preview for Slot " +
                            slot + " was removed.";
                    }
                });

                card.appendChild(removeButton);

            } else {

                const description = document.createElement("p");
                description.textContent =
                    "No advertisement prepared for this slot.";

                const status = document.createElement("span");
                status.className = "status";
                status.textContent = "Unassigned";

                card.appendChild(description);
                card.appendChild(status);
            }

            advertisementList.appendChild(card);
        }
    }

    if (advertisementForm) {

        advertisementForm.addEventListener(
            "submit",
            function (event) {

                event.preventDefault();

                const slot = Number(slotNumber.value);
                const title = advertTitle.value.trim();
                const image = advertImage.value.trim();
                const destination =
                    advertDestination.value.trim();

                if (
                    !Number.isInteger(slot) ||
                    slot < 1 ||
                    slot > billboardSettings.totalSlots
                ) {
                    formMessage.textContent =
                        "Please select a valid billboard slot.";
                    return;
                }

                if (!title || !image || !destination) {
                    formMessage.textContent =
                        "Please complete every field.";
                    return;
                }

                try {

                    const imageURL = new URL(image);
                    const destinationURL =
                        new URL(destination);

                    if (
                        imageURL.protocol !== "https:" ||
                        destinationURL.protocol !== "https:"
                    ) {
                        formMessage.textContent =
                            "Please use HTTPS links for the image " +
                            "and destination.";
                        return;
                    }

                } catch (error) {

                    formMessage.textContent =
                        "Please enter valid image and destination URLs.";
                    return;
                }

                advertisements[slot] = {
                    title: title,
                    image: image,
                    destination: destination
                };

                renderSlots();

                formMessage.textContent =
                    "Advertisement prepared for Slot " + slot +
                    ". It has not been saved permanently or published.";

                advertisementForm.reset();
            }
        );
    }

    renderSlots();

    console.log(
        "AlQlic Marketplace Billboard Admin loaded.",
        billboardSettings
    );

});
```
