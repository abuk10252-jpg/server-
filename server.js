const express = require("express");
const cors = require("cors");
require("dotenv").config();

// ✅ استيرد Firebase
const { db, auth } = require("./utils/firebase");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// ✅ دالة إنشاء Super Admin
async function ensureSuperAdminExists() {
  try {
    const adminEmail = "abuk10252@gmail.com";
    const adminPassword = "Aaabus06555$";

    console.log("🔄 Checking admin existence...");

    // جرب إنشاء في Firebase Auth
    try {
      await auth.createUser({
        email: adminEmail,
        password: adminPassword,
        displayName: "Admin",
      });
      console.log("✅ Admin created in Firebase Auth");
    } catch (error) {
      if (error.code === "auth/email-already-exists") {
        console.log("✅ Admin already exists in Firebase Auth");
      } else {
        console.error("⚠️ Auth error:", error.message);
      }
    }

    // احفظ في Firestore
    await db.collection("users").doc(adminEmail).set({
      email: adminEmail,
      displayName: "Admin",
      role: "admin",
      createdAt: new Date(),
    }, { merge: true });

    console.log("✅ Admin setup complete!");
    console.log("📧 Email: abuk10252@gmail.com");
    console.log("🔐 Password: Aaabus06555$");
  } catch (error) {
    console.error("❌ Admin setup error:", error.message);
  }
}

// استدعِ الدالة
ensureSuperAdminExists();

// Routes
const authRoutes = require("./routes/auth");
app.use("/api/auth", authRoutes);

// Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "Server is running ✅" });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
