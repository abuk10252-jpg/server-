const express = require("express");
const router = express.Router();
const { admin, db } = require("../utils/firebase");
const authMiddleware = require("../middleware/authMiddleware");

// تسجيل مستخدم جديد
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name
    });

    await db.collection("users").doc(userRecord.uid).set({
      name,
      email,
      role: "student",
      createdAt: Date.now()
    });

    res.json({ ok: true, uid: userRecord.uid });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// التحقق من التوكن
router.post("/verify-token", async (req, res) => {
  try {
    const { token } = req.body;
    const decoded = await admin.auth().verifyIdToken(token);
    res.json({ ok: true, uid: decoded.uid });
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
});

// مسار محمي
router.get("/me", authMiddleware, (req, res) => {
  res.json({ ok: true, user: req.user });
});

module.exports = router;