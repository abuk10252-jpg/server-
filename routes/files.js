const express = require("express");
const router = express.Router();
const { bucket, db } = require("../utils/firebase");
const { v4: uuidv4 } = require("uuid");
const createFileData = require("../models/fileModel");

// استيراد نظام الإشعارات الجديد
const { createNotification, sendPushNotification } = require("../utils/notifications");

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

// حفظ بيانات الملف + إرسال إشعار
router.post("/save", async (req, res) => {
  try {
    const { filePath, title, courseId, pushTokens } = req.body;

    const fileUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    // 1) حفظ بيانات الملف في Firestore
    await db.collection("files").add(createFileData(title, fileUrl));

    // 2) إنشاء إشعار في Firestore
    await createNotification({
      title: "تمت إضافة ملف جديد",
      body: `تم رفع ملف (${title})`,
      file_path: filePath,
      file_type: title.split(".").pop(),
      course_id: courseId || null
    });

    // 3) إرسال Push Notification لكل مستخدم
    if (pushTokens && pushTokens.length > 0) {
      for (const token of pushTokens) {
        await sendPushNotification({
          to: token,
          title: "ملف جديد",
          body: `تمت إضافة ملف جديد: ${title}`,
          data: { file_path: filePath, file_url: fileUrl }
        });
      }
    }

    res.json({ ok: true, url: fileUrl });
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
