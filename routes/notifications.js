const express = require("express");
const router = express.Router();
const { db } = require("../utils/firebase");

// 📬 جلب كل الإشعارات
router.get("/", async (req, res) => {
  try {
    const snap = await db.collection("notifications")
      .orderBy("created_at", "desc")
      .limit(100)
      .get();

    const notifications = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ notifications });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// 🔥 تحديد كل الإشعارات كمقروءة
router.post("/mark-all-read", async (req, res) => {
  try {
    const snap = await db.collection("notifications").get();

    const batch = db.batch();
    snap.forEach((doc) => {
      batch.update(doc.ref, { read: true });
    });

    await batch.commit();

    res.json({ ok: true });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Failed to mark notifications" });
  }
});

module.exports = router;
