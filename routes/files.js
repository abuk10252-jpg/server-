const express = require("express");
const router = express.Router();
const { bucket, db } = require("../utils/firebase");
const { v4: uuidv4 } = require("uuid");
const createFileData = require("../models/fileModel");

// إنشاء رابط رفع
router.post("/upload", async (req, res) => {
  try {
    const { fileType } = req.body;
    const filePath = `uploads/${uuidv4()}.${fileType}`;
    const file = bucket.file(filePath);

    const [uploadUrl] = await file.getSignedUrl({
      action: "write",
      expires: Date.now() + 5 * 60 * 1000,
      contentType: fileType
    });

    res.json({ uploadUrl, filePath });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// حفظ بيانات الملف
router.post("/save", async (req, res) => {
  try {
    const { filePath, title } = req.body;

    const fileUrl =` https://storage.googleapis.com/${bucket.name}/${filePath}`;

    await db.collection("files").add(createFileData(title, fileUrl));

    res.json({ ok: true, url: fileUrl });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;