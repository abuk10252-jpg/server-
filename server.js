const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Firebase Admin SDK
let serviceAccount;

try {
  if (process.env.FIREBASE_CREDENTIALS) {
    serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
  } else {
    throw new Error("FIREBASE_CREDENTIALS not found in environment variables");
  }
} catch (error) {
  console.error("❌ Error parsing FIREBASE_CREDENTIALS:", error.message);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const auth = admin.auth();

// ✅ دالة إنشاء Super Admin تلقائياً
async function ensureSuperAdminExists() {
  try {
    const adminEmail = "abuk10252@gmail.com";
    const adminPassword = "Aaabus06555$";

    // تحقق إذا المستخدم موجود في Firestore
    const userSnapshot = await db
      .collection("users")
      .where("email", "==", adminEmail)
      .limit(1)
      .get();

    if (!userSnapshot.empty) {
      console.log("✅ Super Admin already exists in database");
      return;
    }

    // حاول إنشاء المستخدم في Firebase Auth
    let userRecord;
    try {
      userRecord = await auth.createUser({
        email: adminEmail,
        password: adminPassword,
        displayName: "Super Admin",
      });
      console.log("✅ Super Admin Auth User Created:", userRecord.uid);
    } catch (authError) {
      if (authError.code === "auth/email-already-exists") {
        // إذا المستخدم موجود بالفعل في Auth، احصل على بيانته
        console.log("⚠️ Email already exists in Firebase Auth, retrieving user...");
        userRecord = await auth.getUserByEmail(adminEmail);
      } else {
        throw authError;
      }
    }

    // حفظ بيانات المستخدم في Firestore
    await db.collection("users").doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: adminEmail,
      displayName: "Super Admin",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      isVerified: true,
      isActive: true,
    });

    console.log("✅ Super Admin Firestore Document Created");
    console.log("📧 Email:", adminEmail);
    console.log("🔐 Password:", adminPassword);
  } catch (error) {
    console.error("❌ Error ensuring super admin:", error.message);
    // لا توقف السيرفر، استمر في التشغيل
  }
}

// ✅ استدعِ الدالة عند بدء السيرفر
ensureSuperAdminExists();

// Routes
const authRoutes = require("./routes/auth");
app.use("/api/auth", authRoutes);

// Health Check Endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "Server is running ✅" });
});

// 404 Error Handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
