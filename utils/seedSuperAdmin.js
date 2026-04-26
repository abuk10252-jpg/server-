const admin = require("firebase-admin");
const db = admin.firestore();

async function seedSuperAdmin() {
  const email = "abuk10252@gmail.com";
  const password = "Aaabus06555$";
  const name = "Aboubaker Awad";

  const userRef = db.collection("admins").doc(email);
  const doc = await userRef.get();

  if (!doc.exists) {
    await userRef.set({
      name,
      email,
      password,
      role: "super_admin",
      status: "approved",
      createdAt: new Date(),
    });

    console.log("Super Admin created successfully!");
  } else {
    console.log("Super Admin already exists.");
  }
}

module.exports = seedSuperAdmin;
