const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// Middleware: التحقق من التوكن
async function verifyToken(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Middleware: السماح للأدمن فقط (وليس السوبر أدمن)
async function requireAdmin(req, res, next) {
  try {
    const userDoc = await admin.firestore().collection('users').doc(req.uid).get();
    const user = userDoc.data();

    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
      return res.status(403).json({ error: 'Admins only' });
    }

    req.requester = user;
    next();
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}

// 🔥 API: جلب كل الطلاب (بدون سوبر أدمن)
router.get('/users', verifyToken, requireAdmin, async (req, res) => {
  try {
    const snapshot = await admin.firestore().collection('users').get();
    const users = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(u => u.role !== 'super_admin'); // الأدمن ما بشوف سوبر أدمن

    return res.json({ users });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load users' });
  }
});

// 🔥 API: approve طالب
router.post('/approve/:uid', verifyToken, requireAdmin, async (req, res) => {
  const targetUid = req.params.uid;

  try {
    const targetDoc = await admin.firestore().collection('users').doc(targetUid).get();
    if (!targetDoc.exists) return res.status(404).json({ error: 'User not found' });

    const targetUser = targetDoc.data();

    // الأدمن ما بقدر يعدل سوبر أدمن
    if (targetUser.role === 'super_admin') {
      return res.status(403).json({ error: 'Cannot modify super_admin' });
    }

    await admin.firestore().collection('users').doc(targetUid).update({
      status: 'approved'
    });

    return res.json({ success: true, message: 'User approved' });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to approve user' });
  }
});

// 🔥 API: reject طالب
router.post('/reject/:uid', verifyToken, requireAdmin, async (req, res) => {
  const targetUid = req.params.uid;

  try {
    const targetDoc = await admin.firestore().collection('users').doc(targetUid).get();
    if (!targetDoc.exists) return res.status(404).json({ error: 'User not found' });

    const targetUser = targetDoc.data();

    if (targetUser.role === 'super_admin') {
      return res.status(403).json({ error: 'Cannot modify super_admin' });
    }

    await admin.firestore().collection('users').doc(targetUid).update({
      status: 'rejected'
    });

    return res.json({ success: true, message: 'User rejected' });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to reject user' });
  }
});

// 🔥 API: إنشاء كورس
router.post('/courses', verifyToken, requireAdmin, async (req, res) => {
  try {
    const course = req.body;

    const ref = await admin.firestore().collection('courses').add(course);

    return res.json({ success: true, id: ref.id });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to create course' });
  }
});

// 🔥 API: تعديل كورس
router.put('/courses/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    await admin.firestore().collection('courses').doc(req.params.id).update(req.body);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to update course' });
  }
});

// 🔥 API: حذف كورس
router.delete('/courses/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    await admin.firestore().collection('courses').doc(req.params.id).delete();
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to delete course' });
  }
});

// 🔥 API: إنشاء خبر
router.post('/news', verifyToken, requireAdmin, async (req, res) => {
  try {
    const ref = await admin.firestore().collection('news').add(req.body);
    return res.json({ success: true, id: ref.id });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to create news' });
  }
});

// 🔥 API: تعديل خبر
router.put('/news/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    await admin.firestore().collection('news').doc(req.params.id).update(req.body);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to update news' });
  }
});

// 🔥 API: حذف خبر
router.delete('/news/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    await admin.firestore().collection('news').doc(req.params.id).delete();
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to delete news' });
  }
});

module.exports = router;
