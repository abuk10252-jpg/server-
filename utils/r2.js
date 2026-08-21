const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

// Cloudflare R2 متوافق مع S3 API، فبنستخدم نفس الـ SDK بتاع AWS
// لكن بنوجهه لـ endpoint بتاع R2 بدل AWS.
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT, // مثال: https://<account-id>.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME;
// الرابط العام لعرض/تحميل الملفات (r2.dev subdomain أو custom domain)
const PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");

/**
 * رفع ملف على R2 وإرجاع رابطه العام
 * @param {Buffer} buffer محتوى الملف
 * @param {string} key المسار داخل الـ bucket (مثال: courses/abc/file.pdf)
 * @param {string} contentType نوع الملف (mimetype)
 */
async function uploadToR2(buffer, key, contentType) {
  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return `${PUBLIC_URL}/${key}`;
}

/**
 * حذف ملف من R2
 * @param {string} key نفس المسار اللي اتحفظ بيه الملف وقت الرفع
 */
async function deleteFromR2(key) {
  await r2.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );
}

module.exports = { uploadToR2, deleteFromR2 };
