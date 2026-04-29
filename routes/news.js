const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const db = admin.firestore();

// إنشاء خبر جديد
router.post("/", async (req, res) => {
  try {
    const { type, title, content, poll_options, quiz_questions, quiz_time_limit } = req.body;

    if (!title) return res.status(400).json({ error: "Title is required" });

    const newsData = {
      type,
      title,
      content: content || "",
      poll_options: poll_options || [],
      quiz_questions: quiz_questions || [],
      quiz_time_limit: quiz_time_limit || null,
      createdAt: new Date().toISOString(),
    };

    const docRef = await db.collection("news").add(newsData);

    res.json({ ok: true, id: docRef.id, ...newsData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// جلب كل الأخبار
router.get("/", async (req, res) => {
  try {
    const snapshot = await db.collection("news").orderBy("createdAt", "desc").get();
    const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
