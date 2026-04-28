const admin = require("firebase-admin");

let serviceAccount;

try {
  // محاولة parse JSON من FIREBASE_CREDENTIALS
  if (process.env.FIREBASE_CREDENTIALS) {
    serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
  } else {
    throw new Error("FIREBASE_CREDENTIALS not found");
  }
} catch (error) {
  console.error("Error parsing FIREBASE_CREDENTIALS:", error.message);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.STORAGE_BUCKET || serviceAccount.storage_bucket,
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

module.exports = { admin, db, bucket };
