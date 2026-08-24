const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const multer = require('multer');
const { uploadToR2 } = require('../utils/r2');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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

// 🔥 API: نتائج اختبار معيّن (للأدمن)
router.get('/quiz/:id/results', verifyToken, requireAdmin, async (req, res) => {
  try {
    const doc = await admin.firestore().collection('news').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Quiz not found' });

    const quiz = doc.data();
    if (quiz.type !== 'quiz') return res.status(400).json({ error: 'Not a quiz post' });

    const submissions = (quiz.quiz_submissions || []).slice().sort((a, b) => b.score - a.score);

    return res.json({
      quiz: { id: doc.id, title: quiz.title, quiz_questions: quiz.quiz_questions },
      submissions,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load quiz results' });
  }
});

// 🔥 API: قناة دردشة خاصة بالأدمنز بس - زي واتساب، كل الأدمنز (والسوبر أدمن) بيشوفوا نفس القناة
router.get('/chat', verifyToken, requireAdmin, async (req, res) => {
  try {
    const snapshot = await admin.firestore()
      .collection('admin_chat')
      .orderBy('created_at', 'asc')
      .limit(200)
      .get();

    const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.json({ messages });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load chat' });
  }
});

router.post('/chat', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'الرسالة فاضية' });

    const messageData = {
      text: text.trim(),
      sender_id: req.uid,
      sender_name: req.requester.name || req.requester.displayName || 'أدمن',
      sender_photo: req.requester.profile_pic || '',
      created_at: Date.now(),
      edited: false,
    };

    const ref = await admin.firestore().collection('admin_chat').add(messageData);
    return res.json({ success: true, message: { id: ref.id, ...messageData } });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to send message' });
  }
});

// تعديل رسالة - بس صاحبها يقدر يعدلها
router.put('/chat/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'الرسالة فاضية' });

    const ref = admin.firestore().collection('admin_chat').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Message not found' });
    if (doc.data().sender_id !== req.uid) {
      return res.status(403).json({ error: 'تقدر تعدل رسايلك انت بس' });
    }

    await ref.update({ text: text.trim(), edited: true });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to edit message' });
  }
});

// حذف رسالة - صاحبها أو السوبر أدمن يقدروا يحذفوها
router.delete('/chat/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const ref = admin.firestore().collection('admin_chat').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Message not found' });

    const isOwner = doc.data().sender_id === req.uid;
    const isSuperAdmin = req.requester.role === 'super_admin';
    if (!isOwner && !isSuperAdmin) {
      return res.status(403).json({ error: 'تقدر تحذف رسايلك انت بس' });
    }

    await ref.delete();
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to delete message' });
  }
});

// معلومات القناة - صورتها + قائمة الأدمنز (زي بروفايل قروب الواتساب)
router.get('/chat/info', verifyToken, requireAdmin, async (req, res) => {
  try {
    const metaDoc = await admin.firestore().collection('admin_chat_meta').doc('info').get();
    const meta = metaDoc.exists ? metaDoc.data() : { photo_url: '' };

    const usersSnap = await admin.firestore()
      .collection('users')
      .where('role', 'in', ['admin', 'super_admin'])
      .get();

    const members = usersSnap.docs.map(doc => {
      const u = doc.data();
      return {
        id: doc.id,
        name: u.name || u.displayName || 'أدمن',
        photo: u.profile_pic || '',
        role: u.role,
      };
    });

    return res.json({ photo_url: meta.photo_url || '', members });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load channel info' });
  }
});

// تغيير صورة القناة - أي أدمن يقدر يغيرها زي قروب الواتساب
router.post('/chat/photo', verifyToken, requireAdmin, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'الصورة مطلوبة' });

    const key = `admin_chat/channel_photo_${Date.now()}.jpg`;
    const url = await uploadToR2(req.file.buffer, key, req.file.mimetype);

    await admin.firestore().collection('admin_chat_meta').doc('info').set(
      { photo_url: url, updated_by: req.uid, updated_at: Date.now() },
      { merge: true }
    );

    return res.json({ success: true, photo_url: url });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to update channel photo' });
  }
});

module.exports = router;
