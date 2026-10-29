
import { auth, db, storage } from "./firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ===============================
// LOAD PROFILE DETAILS
// ===============================

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    currentUser = user;

    try {
        const userRef = doc(db, "users", user.uid);
        const snapshot = await getDoc(userRef);

        const data = snapshot.exists() ? snapshot.data() : {};

        document.getElementById("fullName").value = data.name || "";
        document.getElementById("username").value = data.username || "";
        document.getElementById("bio").value = data.bio || "";
        document.getElementById("email").value = data.email || user.email || "";
        document.getElementById("phone").value = data.phone || "";
        document.getElementById("country").value = data.country || "";
        document.getElementById("city").value = data.city || "";

    } catch (error) {
        console.error("Error loading profile:", error);
        alert("Could not load your profile. Please check your internet connection and try again.");
    }
});

// ===============================
// SAVE PROFILE DETAILS
// ===============================

const saveProfileBtn = document.getElementById("saveProfile");
const topSaveBtn = document.getElementById("topSaveBtn");

async function saveProfile() {
    const user = currentUser || auth.currentUser;

    if (!user) {
        alert("Please log in again before saving.");
        return;
    }

    const name = document.getElementById("fullName").value.trim();
    const username = document.getElementById("username").value.trim();
    const bio = document.getElementById("bio").value.trim();
    const email = document.getElementById("email").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const country = document.getElementById("country").value.trim();
    const city = document.getElementById("city").value.trim();

    try {
        const userRef = doc(db, "users", user.uid);
        const snapshot = await getDoc(userRef);

        // Keep existing fields and update the edited details.
        const existingData = snapshot.exists() ? snapshot.data() : {};

        await setDoc(userRef, {
            ...existingData,
            name,
            username,
            bio,
            email,
            phone,
            country,
            city
        });

        alert("Profile saved successfully!");
        window.location.href = "profile.html";

    } catch (error) {
        console.error("Error saving profile:", error);
        alert("Profile could not be saved: " + error.message);
    }
}

if (saveProfileBtn) {
    saveProfileBtn.addEventListener("click", saveProfile);
}

if (topSaveBtn) {
    topSaveBtn.addEventListener("click", saveProfile);
}

// ===============================
// BACK BUTTON
// ===============================

const backBtn = document.getElementById("backBtn");

if (backBtn) {
    backBtn.addEventListener("click", () => {
        window.location.href = "profile.html";
    });
}

// ===============================
// PHOTO PREVIEW
// Note: This previews the image only.
// It does not upload or permanently save it.
// ===============================

const changePhotoBtn = document.getElementById("changePhotoBtn");
const profilePhotoInput = document.getElementById("profilePhotoInput");
const profilePhotoPreview = document.getElementById("profilePhotoPreview");

if (changePhotoBtn && profilePhotoInput) {
    changePhotoBtn.addEventListener("click", () => {
        profilePhotoInput.click();
    });
}

if (profilePhotoInput && profilePhotoPreview) {
    profilePhotoInput.addEventListener("change", () => {
        const file = profilePhotoInput.files[0];

        if (!file) return;

        if (!file.type.startsWith("image/")) {
            alert("Please select an image file.");
            profilePhotoInput.value = "";
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            alert("Please choose an image smaller than 5 MB.");
            profilePhotoInput.value = "";
            return;
        }

        const reader = new FileReader();

        reader.onload = () => {
            profilePhotoPreview.src = reader.result;
        };

        reader.readAsDataURL(file);
    });
}
