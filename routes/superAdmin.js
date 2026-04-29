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

// Middleware: السماح للسوبر أدمن فقط
async function requireSuperAdmin(req, res, next) {
  try {
    const userDoc = await admin.firestore().collection('users').doc(req.uid).get();
    const user = userDoc.data();

    if (!user || user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super_admin can perform this action' });
    }

    req.requester = user;
    next();
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}

// 🔥 API: جلب كل المستخدمين
router.get('/users', verifyToken, requireSuperAdmin, async (req, res) => {
  try {
    const snapshot = await admin.firestore().collection('users').get();
    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.json({ users });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load users' });
  }
});

// 🔥 API: تعديل الرتبة
router.post('/set-role/:uid', verifyToken, requireSuperAdmin, async (req, res) => {
  const targetUid = req.params.uid;
  const { role } = req.body;

  if (!['student', 'admin', 'super_admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    // منع تعديل نفسه
    if (targetUid === req.uid) {
      return res.status(403).json({ error: 'You cannot modify your own role' });
    }

    const targetDoc = await admin.firestore().collection('users').doc(targetUid).get();
    if (!targetDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUser = targetDoc.data();

    // منع الأدمن من تعديل سوبر أدمن
    if (targetUser.role === 'super_admin' && role !== 'super_admin') {
      return res.status(403).json({ error: 'Cannot modify another super_admin' });
    }

    // تحديث الرتبة
    await admin.firestore().collection('users').doc(targetUid).update({ role });

    return res.json({ success: true, message: `Role updated to ${role}` });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to update role' });
  }
});

module.exports = router;
