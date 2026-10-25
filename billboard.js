
/* =========================================
   ALQLIC ADVERTISEMENT BILLBOARD
========================================= */

document.addEventListener("DOMContentLoaded", function () {
    const billboardImage = document.getElementById("billboardImage");
    const billboardLink = document.getElementById("billboardLink");
    const billboardCaption = document.getElementById("billboardCaption");

    // Temporary preview advertisements.
    // These are examples, not real paid client adverts.
    const advertisements = [
        {
            title: "Welcome to AlQlic",
            image: "",
            destination: "https://g7techglob.github.io/AlQlic/"
        }
    ];

    const rotationMinutes = 20;
    let currentIndex = 0;

    function showAdvertisement() {
        if (!billboardImage || !billboardLink || !billboardCaption) {
            console.error("Billboard HTML elements were not found.");
            return;
        }

        if (advertisements.length === 0) {
            billboardImage.removeAttribute("src");
            billboardLink.href = "#";
            billboardCaption.textContent =
                "No advertisements are available right now.";
            return;
        }

        const advert = advertisements[currentIndex];

        billboardCaption.textContent = advert.title;
        billboardLink.href = advert.destination;

        if (advert.image) {
            billboardImage.src = advert.image;
            billboardImage.alt = advert.title;
            billboardImage.style.display = "block";
        } else {
            billboardImage.removeAttribute("src");
            billboardImage.alt = "Advertisement image not yet added";
            billboardImage.style.display = "none";
            billboardCaption.textContent =
                advert.title + " — billboard preview";
        }

        currentIndex = (currentIndex + 1) % advertisements.length;
    }

    showAdvertisement();

    // Rotate every 20 minutes.
    window.setInterval(
        showAdvertisement,
        rotationMinutes * 60 * 1000
    );
});
