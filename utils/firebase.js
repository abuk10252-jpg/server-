const admin = require("firebase-admin");
require("dotenv").config();

let serviceAccount;

try {
  // محاولة parse JSON من FIREBASE_CREDENTIALS
  if (process.env.FIREBASE_CREDENTIALS) {
    serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
  } else {
    throw new Error("FIREBASE_CREDENTIALS not found");
  }
} catch (error) {
  console.error("❌ Error parsing FIREBASE_CREDENTIALS:", error.message);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.STORAGE_BUCKET || serviceAccount.storage_bucket,
});

const db = admin.firestore();
const auth = admin.auth();  // ✅ أضفنا هذا
const bucket = admin.storage().bucket();

// ✅ أضفنا auth إلى الـ export
module.exports = { admin, db, auth, bucket };
