
import { db } from "./firebase.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const gifts = [
    {
        name: "Tiny Heart",
        icon: "💗",
        price: 1,
        category: "popular"
    },
    {
        name: "Rose",
        icon: "🌹",
        price: 5,
        category: "flowers"
    },
    {
        name: "Heart",
        icon: "❤️",
        price: 10,
        category: "popular"
    },
    {
        name: "Bouquet",
        icon: "💐",
        price: 50,
        category: "flowers"
    },
    {
        name: "Star",
        icon: "⭐",
        price: 100,
        category: "popular"
    },
    {
        name: "Birthday Cake",
        icon: "🎂",
        price: 250,
        category: "premium"
    },
    {
        name: "Crown",
        icon: "👑",
        price: 500,
        category: "premium"
    },
    {
        name: "Diamond",
        icon: "💎",
        price: 1000,
        category: "premium"
    },
    {
        name: "Luxury Car",
        icon: "🚗",
        price: 5000,
        category: "luxury"
    },
    {
        name: "Castle",
        icon: "🏰",
        price: 10000,
        category: "luxury"
    },
    {
        name: "Yacht",
        icon: "🛥️",
        price: 25000,
        category: "luxury"
    },
    {
        name: "AlQlic Universe",
        icon: "🚀",
        price: 100000,
        category: "luxury"
    }
];

const giftList = document.getElementById("giftList");
const giftDetails = document.getElementById("giftDetails");
const selectedGiftName = document.getElementById("selectedGiftName");
const selectedGiftPrice = document.getElementById("selectedGiftPrice");
const confirmGiftBtn = document.getElementById("confirmGiftBtn");
const walletBalance = document.getElementById("walletBalance");

let selectedGift = null;
let activeCategory = "all";

// Wallet connection will be added after we confirm
// the existing AlQlic wallet document structure.
walletBalance.textContent = "Wallet connection pending";

// DISPLAY GIFTS

function displayGifts(category = "all") {

    giftList.innerHTML = "";

    const filteredGifts = category === "all"
        ? gifts
        : gifts.filter(gift => gift.category === category);

    filteredGifts.forEach(gift => {

        const button = document.createElement("button");

        button.className = "gift-option";

        if (selectedGift && selectedGift.name === gift.name) {
            button.classList.add("selected");
        }

        button.innerHTML = `
            <div class="gift-icon">${gift.icon}</div>
            <span>${gift.name}</span>
            <small>${gift.price.toLocaleString()} MCC</small>
        `;

        button.addEventListener("click", () => {
            selectGift(gift);
        });

        giftList.appendChild(button);
    });
}

// SELECT GIFT

function selectGift(gift) {

    selectedGift = gift;

    selectedGiftName.textContent =
        `${gift.icon} ${gift.name}`;

    selectedGiftPrice.textContent =
        `Gift price: ${gift.price.toLocaleString()} MCC`;

    giftDetails.hidden = false;

    confirmGiftBtn.disabled = false;

    displayGifts(activeCategory);
}

// CATEGORY FILTERS

document.querySelectorAll(".gift-categories button")
    .forEach(button => {

        button.addEventListener("click", () => {

            document.querySelectorAll(".gift-categories button")
                .forEach(item => item.classList.remove("active"));

            button.classList.add("active");

            activeCategory = button.dataset.category;

            displayGifts(activeCategory);
        });
    });

// CONTINUE BUTTON

confirmGiftBtn.addEventListener("click", () => {

    if (!selectedGift) {
        return;
    }

    alert(
        `You selected ${selectedGift.name} for ` +
        `${selectedGift.price.toLocaleString()} MCC.\n\n` +
        `Gift checkout is not connected yet. ` +
        `Your wallet has NOT been charged.`
    );

});

// INITIAL DISPLAY

displayGifts();
