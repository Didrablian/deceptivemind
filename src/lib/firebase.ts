// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAEWH9to3Dyo62Mv3HZcXLMcOLueEZjaTs",
  authDomain: "deceptive-minds-nu0kh.firebaseapp.com",
  projectId: "deceptive-minds-nu0kh",
  storageBucket: "deceptive-minds-nu0kh.firebasestorage.app", // Corrected: remove .firebaseio.com if it's for firestore/storage
  messagingSenderId: "701062298069",
  appId: "1:701062298069:web:47d2ac370cbbb7e147e55c"
};

// Initialize Firebase
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const db = getFirestore(app);
const storage = getStorage(app);

export { app, db, storage };
