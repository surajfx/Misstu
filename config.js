// ============================================
// Put your own details here — you don't need to touch the rest of the code
// ============================================

// 1) Firebase Realtime Database config
//    Firebase console (console.firebase.google.com) -> Project settings -> your web app -> config
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "0000000000",
  appId: "YOUR_APP_ID"
};

// 2) Cloudinary (for photo & video uploads — the same one you already use on surajfx.in)
const CLOUDINARY_CLOUD_NAME = "YOUR_CLOUD_NAME";
const CLOUDINARY_UPLOAD_PRESET = "YOUR_UNSIGNED_UPLOAD_PRESET";

// 3) The two names, avatars, and each person's own PIN
//    (avatar shows the first letter of the name if you don't give an image URL)
const CHAT_USERS = {
  a: { name: "suraj",  avatar: "", pin: "misstu" },
  b: { name: "misstu", avatar: "", pin: "suraj" }
};

// 4) This chat's unique room name — keeps data separate even if you reuse this
//    Firebase project for another app
const CHAT_ROOM_ID = "duti-private-room";
