import { auth, db, storage } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// Load user data into form
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data();

    document.getElementById("fullName").value = data.name || "";
    document.getElementById("username").value = data.username || "";
    document.getElementById("bio").value = data.bio || "";
    document.getElementById("email").value = data.email || "";
    document.getElementById("phone").value = data.phone || "";
    document.getElementById("country").value = data.country || "";
    document.getElementById("city").value = data.city || "";
  }
});

// Save profile to Firestore
document.getElementById("saveProfile").addEventListener("click", async () => {
  const user = auth.currentUser;

  if (!user) return;

  await updateDoc(doc(db, "users", user.uid), {
    name: document.getElementById("fullName").value,
    username: document.getElementById("username").value,
    bio: document.getElementById("bio").value,
    email: document.getElementById("email").value,
    phone: document.getElementById("phone").value,
    country: document.getElementById("country").value,
    city: document.getElementById("city").value
  });

  alert("Profile updated successfully!");
  window.location.href = "profile.html";
});


const backBtn = document.getElementById("backBtn");

if (backBtn) {
    backBtn.addEventListener("click", () => {
        if (window.history.length > 1) {
            window.history.back();
        } else {
            window.location.href = "profile.html";
        }
    });
}
const topSaveBtn = document.getElementById("topSaveBtn");
const saveProfileBtn = document.getElementById("saveProfile");

if (topSaveBtn && saveProfileBtn) {
    topSaveBtn.addEventListener("click", () => {
        saveProfileBtn.click();
    });
}

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
