const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const db = admin.firestore();

// إنشاء مادة جديدة
router.post("/", async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title) return res.status(400).json({ error: "Title is required" });

    const courseData = {
      title,
      description: description || "",
      createdAt: new Date().toISOString(),
    };

    const docRef = await db.collection("courses").add(courseData);

    res.json({ ok: true, id: docRef.id, ...courseData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// جلب كل المواد
router.get("/", async (req, res) => {
  try {
    const snapshot = await db.collection("courses").orderBy("createdAt", "desc").get();
    const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
