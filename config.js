// ============================================
// Put your own details here — you don't need to touch the rest of the code
// ============================================

// 1) Firebase Realtime Database config
//    Firebase console (console.firebase.google.com) -> Project settings -> your web app -> config
const firebaseConfig = {
  apiKey: "AIzaSyDCb0OReMC3BScflE5lpvsp9F6Denq5nqM",
  authDomain: "surajfx-dbfbf.firebaseapp.com",
  databaseURL: "https://surajfx-dbfbf-default-rtdb.firebaseio.com",
  projectId: "surajfx-dbfbf",
  storageBucket: "surajfx-dbfbf.firebasestorage.app",
  messagingSenderId: "1082799197835",
  appId: "1:1082799197835:web:1a2fad3bea6f58b0570e8e",
  measurementId: "G-7VEVP08DJ6"
};

// 2) Cloudinary (for photo & video uploads — the same one you already use on surajfx.in)
// STILL NEEDED FROM YOU: your Cloudinary cloud name + an unsigned upload preset name
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
