const { admin, db } = require("../utils/firebase");

module.exports = async function authMiddleware(req, res, next) {
  try {
    // الحصول على التوكن من header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: "لا يوجد توكن" });
    }

    // استخراج التوكن من "Bearer TOKEN"
    const token = authHeader.split(" ")[1];
    
    if (!token) {
      return res.status(401).json({ error: "صيغة التوكن غير صحيحة" });
    }

    // التحقق من صحة التوكن
    const decoded = await admin.auth().verifyIdToken(token);

    // جلب بيانات المستخدم من Firestore
    const userDoc = await db.collection("users").doc(decoded.uid).get();
    const userData = userDoc.data();

    if (!userData) {
      return res.status(404).json({ error: "بيانات المستخدم غير موجودة" });
    }

    // حفظ بيانات المستخدم في req
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      ...userData
    };

    next();
  } catch (err) {
    console.error("Auth middleware error:", err.message);
    res.status(401).json({ error: "توكن غير صالح" });
  }
};
