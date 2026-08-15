const express = require("express");
const router = express.Router();
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const admin = require("firebase-admin");
const { db, bucket } = require("../utils/firebase");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

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

router.post("/", verifyToken, loadUser, requireAdmin, async (req, res) => {
  try {
    const { name, name_ar, description, description_ar } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    const courseData = {
      name,
      name_ar: name_ar || "",
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

router.get("/", verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection("courses").orderBy("created_at", "desc").get();
    const courses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.json({ courses });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/:id", verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("courses").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Course not found" });
    return res.json({ course: { id: doc.id, ...doc.data() } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.put("/:id", verifyToken, loadUser, requireAdmin, async (req, res) => {
  try {
    const { name, name_ar, description, description_ar } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (name_ar !== undefined) updates.name_ar = name_ar;
    if (description !== undefined) updates.description = description;
    if (description_ar !== undefined) updates.description_ar = description_ar;

    await db.collection("courses").doc(req.params.id).update(updates);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", verifyToken, loadUser, requireAdmin, async (req, res) => {
  try {
    await db.collection("courses").doc(req.params.id).delete();
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

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
      await bucket.file(target.path).delete().catch(() => {});
    }

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
