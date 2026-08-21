const express = require("express");
const router = express.Router();
const multer = require("multer");
const { admin, db } = require("../utils/firebase");
const authMiddleware = require("../middleware/authMiddleware");
const { uploadToR2 } = require("../utils/r2");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 ميجا كافية لصورة بروفايل
});

// تسجيل جديد
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, university_id } = req.body;

    if (!name || !email || !password || !university_id) {
      return res.status(400).json({ error: "جميع الحقول مطلوبة" });
    }

    // إنشاء مستخدم في Firebase Auth
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name
    });

    // شكل المستخدم كما يتوقعه التطبيق
    const userData = {
      id: userRecord.uid,
      name,
      email,
      university_id,
      role: "student",
      status: "pending",
      language: "ar",
      profile_pic: "",
      subscribed_courses: [],
      createdAt: new Date().toISOString()
    };

    // حفظ البيانات في Firestore
    await db.collection("users").doc(userRecord.uid).set(userData);

    // إنشاء توكن
    const idToken = await admin.auth().createCustomToken(userRecord.uid);

    res.status(201).json({
      ok: true,
      user: userData,
      token: idToken
    });

  } catch (err) {
    console.error("Register error:", err.message);

    if (err.code === "auth/email-already-exists") {
      return res.status(400).json({ error: "البريد الإلكتروني مسجل بالفعل" });
    }

    if (err.code === "auth/weak-password") {
      return res.status(400).json({ error: "كلمة المرور ضعيفة جداً" });
    }

    res.status(400).json({ error: err.message });
  }
});

// الدخول
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "البريد وكلمة المرور مطلوبة" });
    }

    const userRecord = await admin.auth().getUserByEmail(email);
    const idToken = await admin.auth().createCustomToken(userRecord.uid);

    const userDoc = await db.collection("users").doc(userRecord.uid).get();
    const userData = userDoc.data();

    if (!userData) {
      return res.status(404).json({ error: "بيانات المستخدم غير موجودة" });
    }

    res.json({
      ok: true,
      user: userData,
      token: idToken
    });

  } catch (err) {
    console.error("Login error:", err.message);

    if (err.code === "auth/user-not-found") {
      return res.status(401).json({ error: "بيانات دخول غير صحيحة" });
    }

    res.status(401).json({ error: "فشل الدخول" });
  }
});

// التحقق من التوكن
router.post("/verify-token", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "التوكن مطلوب" });
    }

    const decoded = await admin.auth().verifyIdToken(token);
    const userDoc = await db.collection("users").doc(decoded.uid).get();
    const userData = userDoc.data();

    if (!userData) {
      return res.status(404).json({ error: "بيانات المستخدم غير موجودة" });
    }

    res.json({
      ok: true,
      user: userData,
      uid: decoded.uid
    });

  } catch (err) {
    console.error("Verify token error:", err.message);
    res.status(401).json({ error: "توكن غير صالح" });
  }
});

// الحصول على بيانات المستخدم الحالي
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const userDoc = await db.collection("users").doc(req.user.uid).get();
    const userData = userDoc.data();

    res.json({
      ok: true,
      user: userData
    });

  } catch (err) {
    console.error("Get user error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// تحديث بيانات المستخدم
router.put("/update", authMiddleware, async (req, res) => {
  try {
    const { name, role, status, language, profile_pic } = req.body;
    const uid = req.user.uid;

    const updateData = {};
    if (name) updateData.name = name;
    if (role) updateData.role = role;
    if (status) updateData.status = status;
    if (language) updateData.language = language;
    if (profile_pic) updateData.profile_pic = profile_pic;

    await db.collection("users").doc(uid).update(updateData);
    const updatedDoc = await db.collection("users").doc(uid).get();

    res.json({
      ok: true,
      user: updatedDoc.data()
    });

  } catch (err) {
    console.error("Update user error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// حفظ Expo Push Token بتاع الجهاز عشان نقدر نبعت له إشعارات فعلية على الموبايل
router.post("/push-token", authMiddleware, async (req, res) => {
  try {
    const { push_token } = req.body;
    if (!push_token) return res.status(400).json({ error: "push_token مطلوب" });

    const uid = req.user.uid;
    await db.collection("users").doc(uid).update({ push_token });

    res.json({ ok: true });
  } catch (err) {
    console.error("Save push token error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// تسجيل الخروج
router.post("/logout", authMiddleware, async (req, res) => {
  try {
    res.json({ ok: true, message: "تم تسجيل الخروج بنجاح" });
  } catch (err) {
    console.error("Logout error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// رفع صورة البروفايل (بترفع على Cloudflare R2 وتحفظ الرابط في Firestore)
router.post("/upload-photo", authMiddleware, upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "لا يوجد ملف" });

    const uid = req.user.uid;
    const ext = (req.file.originalname.split(".").pop() || "jpg").toLowerCase();
    const key = `avatars/${uid}.${ext}`;

    const url = await uploadToR2(req.file.buffer, key, req.file.mimetype);

    await db.collection("users").doc(uid).update({ profile_pic: url });

    res.json({ ok: true, profile_pic: url });
  } catch (err) {
    console.error("Upload photo error:", err.message);
    res.status(500).json({ error: err.message || "فشل رفع الصورة" });
  }
});

module.exports = router;
