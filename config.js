// ============================================
// এখানে নিজের তথ্য বসাও — বাকি কোড ছোঁয়া লাগবে না
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

// 2) Cloudinary (ছবি ও ভিডিও আপলোডের জন্য — surajfx.in এ যেটা আগে থেকেই ব্যবহার করছো)
const CLOUDINARY_CLOUD_NAME = "YOUR_CLOUD_NAME";
const CLOUDINARY_UPLOAD_PRESET = "YOUR_UNSIGNED_UPLOAD_PRESET";

// 3) দুজনের নাম ও ছবি (avatar এ প্রথম অক্ষর দেখাবে যদি ছবি না দাও)
const CHAT_USERS = {
  a: { name: "USER_A_NAME", avatar: "" }, // avatar এ চাইলে image URL দিতে পারো
  b: { name: "USER_B_NAME", avatar: "" }
};

// 4) দুজনের শেয়ার করা পিন কোড (সহজ লক — Firebase Auth নয়, দ্রুত ঢোকার জন্য)
const CHAT_PIN = "1234";

// 5) এই চ্যাটের ইউনিক নাম — একই Firebase প্রজেক্টে অন্য অ্যাপ থাকলেও যাতে ডেটা না মেশে
const CHAT_ROOM_ID = "duti-private-room";
