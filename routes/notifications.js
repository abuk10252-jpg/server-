const express = require("express");
const router = express.Router();
const { db } = require("../utils/firebase");

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
