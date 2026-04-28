const admin = require("firebase-admin");

// تحقق من وجود بيانات Firebase
if (!process.env.FIREBASE_CREDENTIALS) {
  console.error("❌ ERROR: FIREBASE_CREDENTIALS environment variable not set!");
  process.exit(1);
}

let serviceAccount;

// حاول تحليل JSON
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
} catch (error) {
  console.error("❌ ERROR: Invalid JSON in FIREBASE_CREDENTIALS:", error.message);
  process.exit(1);
}

// تهيئ Firebase Admin SDK
try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("✅ Firebase initialized successfully");
} catch (error) {
  console.error("❌ ERROR initializing Firebase:", error.message);
  process.exit(1);
}

const db = admin.firestore();
const auth = admin.auth();

module.exports = { admin, db, auth };
