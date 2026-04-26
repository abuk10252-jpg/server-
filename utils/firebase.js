const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "../firebase-key.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: `${serviceAccount.project_id}.appspot.com`
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

module.exports = { admin, db, bucket };
