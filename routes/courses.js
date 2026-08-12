const express = require("express");
const router = express.Router();
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const admin = require("firebase-admin");
const { db, bucket } = require("../utils/firebase");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB لكل ملف
});

// ============ Middlewares ============
async function verifyToken(req, res, next) {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token provided" });

    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

async function loadUser(req, res, next) {
  try {
    const doc = await db.collection("users").doc(req.uid).get();
    req.user = doc.exists ? { id: req.uid, ...doc.data() } : null;
    next();
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
}

async function requireAdmin(req, res, next) {
  if (!req.user || (req.user.role !== "admin" && req.user.role !== "super_admin")) {
    return res.status(403).json({ error: "Admins only" });
  }
  next();
}

// ============ إنشاء مادة جديدة (أدمن فقط) ============
router.post("/", verifyToken, loadUser, requireAdmin, async (req, res) => {
  try {
    const { title, title_ar, description, description_ar } = req.body;
    if (!title) return res.status(400).json({ error: "Title is required" });

    const courseData = {
      title,
      title_ar: title_ar || "",
      description: description || "",
      description_ar: description_ar || "",
      files: [],
      created_at: Date.now(),
      created_by: req.uid,
    };

    const docRef = await db.collection("courses").add(courseData);
    return res.json({ success: true, id: docRef.id, course: { id: docRef.id, ...courseData } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ============ جلب كل المواد ============
router.get("/", verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection("courses").orderBy("created_at", "desc").get();
    const courses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.json({ courses });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ============ جلب مادة واحدة (مع ملفاتها) ============
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("courses").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Course not found" });
    return res.json({ course: { id: doc.id, ...doc.data() } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ============ تعديل مادة (أدمن فقط) ============
router.put("/:id", verifyToken, loadUser, requireAdmin, async (req, res) => {
  try {
    const { title, title_ar, description, description_ar } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (title_ar !== undefined) updates.title_ar = title_ar;
    if (description !== undefined) updates.description = description;
    if (description_ar !== undefined) updates.description_ar = description_ar;

    await db.collection("courses").doc(req.params.id).update(updates);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ============ حذف مادة (أدمن فقط) ============
router.delete("/:id", verifyToken, loadUser, requireAdmin, async (req, res) => {
  try {
    await db.collection("courses").doc(req.params.id).delete();
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ============ رفع ملف لمادة (أدمن فقط) ============
// الفرونت إند بيبعت multipart/form-data مباشرة (مش رابط رفع من نوعين)
router.post("/:id/files", verifyToken, loadUser, requireAdmin, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const courseRef = db.collection("courses").doc(req.params.id);
    const courseDoc = await courseRef.get();
    if (!courseDoc.exists) return res.status(404).json({ error: "Course not found" });

    const fileId = uuidv4();
    const ext = (req.file.originalname.split(".").pop() || "").toLowerCase();
    const storagePath = `courses/${req.params.id}/${fileId}.${ext}`;
    const blob = bucket.file(storagePath);

    await new Promise((resolve, reject) => {
      const stream = blob.createWriteStream({
        metadata: { contentType: req.file.mimetype },
      });
      stream.on("error", reject);
      stream.on("finish", resolve);
      stream.end(req.file.buffer);
    });

    await blob.makePublic();
    const url = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

    const fileData = {
      id: fileId,
      name: req.file.originalname,
      url,
      path: storagePath,
      size: req.file.size,
      uploaded_at: Date.now(),
      uploaded_by: req.uid,
    };

    await courseRef.update({
      files: admin.firestore.FieldValue.arrayUnion(fileData),
    });

    return res.json({ success: true, file: fileData });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Failed to upload file" });
  }
});

// ============ حذف ملف من مادة (أدمن فقط) ============
router.delete("/:id/files/:fileId", verifyToken, loadUser, requireAdmin, async (req, res) => {
  try {
    const courseRef = db.collection("courses").doc(req.params.id);
    const courseDoc = await courseRef.get();
    if (!courseDoc.exists) return res.status(404).json({ error: "Course not found" });

    const files = courseDoc.data().files || [];
    const target = files.find(f => f.id === req.params.fileId);
    const remaining = files.filter(f => f.id !== req.params.fileId);

    await courseRef.update({ files: remaining });

    if (target?.path) {
      await bucket.file(target.path).delete().catch(() => {
        // لو الملف مش موجود في الـ storage أصلاً، تجاهل الخطأ ده
      });
    }

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
