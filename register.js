import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";


// ==========================================
// FIREBASE CONFIGURATION
// ==========================================

const firebaseConfig = {
  apiKey: "AIzaSyCVdy9nJLp3YDV9PNB9kfR3HiQCdFdvGmg",
  authDomain: "matchconnect-44a3e.firebaseapp.com",
  projectId: "matchconnect-44a3e",
  storageBucket: "matchconnect-44a3e.firebasestorage.app",
  messagingSenderId: "283382943870",
  appId: "1:283382943870:web:ee1d08c65bcbac400cc82f"
};


// ==========================================
// INITIALIZE FIREBASE
// ==========================================

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);

const functions = getFunctions(app);


// ==========================================
// REGISTER BUTTON
// ==========================================

document
  .getElementById("registerBtn")
  .addEventListener("click", async () => {

    const name =
      document
        .getElementById("registerName")
        .value
        .trim();

    const email =
      document
        .getElementById("registerEmail")
        .value
        .trim();

    const password =
      document
        .getElementById("registerPassword")
        .value;

    const confirmPassword =
      document
        .getElementById("confirmPassword")
        .value;


    // Check username
    if (!name) {

      alert("Please enter a username.");
      return;

    }


    // Check that passwords match BEFORE
    // creating the Firebase account
    if (password !== confirmPassword) {

      alert(
        "Passwords do not match. Please check and try again."
      );

      return;

    }


    try {

      // 1. Create user in Firebase Authentication
      const userCredential =
        await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

      const user =
        userCredential.user;


      // 2. Send verification email
      await sendEmailVerification(user);

      console.log(
        "Verification email sent successfully"
      );


      // 3. Save user profile in Firestore
      await setDoc(
        doc(db, "users", user.uid),
        {
          email: user.email,
          username: name,
          bio: "",
          photoURL: "",
          createdAt: new Date()
        }
      );

      console.log(
        "User profile saved successfully"
      );


      // 4. Create AlQlic wallet securely
      // through the Firebase backend
      const createWallet =
        httpsCallable(
          functions,
          "createWallet"
        );

      const walletResult =
        await createWallet();

      const walletData =
        walletResult.data;

      console.log(
        "Wallet created successfully:",
        walletData.walletId
      );


      // 5. Registration successful
      alert(
        "Account created successfully! Please check your email and verify your account."
      );

      window.location.href =
        "verify-email.html";


    } catch (error) {

      console.error(
        "Registration error:",
        error
      );

      alert(error.message);

    }

  });


// ==========================================
// SHOW / HIDE PASSWORDS
// ==========================================

function setupPasswordToggle(
  inputId,
  buttonId,
  showLabel,
  hideLabel
) {

  const passwordInput =
    document.getElementById(inputId);

  const toggleButton =
    document.getElementById(buttonId);


  toggleButton.addEventListener(
    "click",
    () => {

      if (
        passwordInput.type === "password"
      ) {

        // Show password
        passwordInput.type = "text";

        // Normal eye when password is visible
        toggleButton.textContent = "👁";

        toggleButton.setAttribute(
          "aria-label",
          hideLabel
        );

      } else {

        // Hide password
        passwordInput.type = "password";

        // Slashed eye when password is hidden
        toggleButton.textContent = "👁";

        toggleButton.setAttribute(
          "aria-label",
          showLabel
        );

      }

    }
  );

}


// Main password field
setupPasswordToggle(
  "registerPassword",
  "togglePassword",
  "Show password",
  "Hide password"
);


// Confirm password field
setupPasswordToggle(
  "confirmPassword",
  "toggleConfirmPassword",
  "Show confirm password",
  "Hide confirm password"
);
