const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const multer = require('multer');
const { uploadToR2 } = require('../utils/r2');
const { sendExpoPush } = require('../utils/push');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

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

    const attempts = (quiz.quiz_submissions || []).slice().sort((a, b) => {
      if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
      return (a.time_spent || 0) - (b.time_spent || 0);
    });

    return res.json({
      quiz: {
        id: doc.id,
        title: quiz.title,
        title_ar: quiz.title_ar || quiz.title,
        quiz_questions: quiz.quiz_questions,
        quiz_results_published: !!quiz.quiz_results_published,
        quiz_time_limit: quiz.quiz_time_limit,
        created_at: quiz.created_at,
      },
      attempts,
      submissions: attempts,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load quiz results' });
  }
});

// نتائج منشورة — أي مستخدم مسجّل يقدر يشوفها
router.get('/quiz/:id/public-results', verifyToken, async (req, res) => {
  try {
    const doc = await admin.firestore().collection('news').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Quiz not found' });
    const quiz = doc.data();
    if (quiz.type !== 'quiz') return res.status(400).json({ error: 'Not a quiz' });
    if (!quiz.quiz_results_published) {
      return res.status(403).json({ error: 'النتائج لسه ما اتنشرت' });
    }
    const attempts = (quiz.quiz_submissions || []).slice().sort((a, b) => {
      if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
      return (a.time_spent || 0) - (b.time_spent || 0);
    });
    return res.json({
      quiz: {
        id: doc.id,
        title: quiz.title,
        title_ar: quiz.title_ar || quiz.title,
      },
      attempts,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load public results' });
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
    const { text, media_url, media_type, sticker } = req.body;
    const hasText = text && text.trim();
    const hasMedia = media_url && media_type;
    const hasSticker = sticker && String(sticker).trim();
    if (!hasText && !hasMedia && !hasSticker) {
      return res.status(400).json({ error: 'الرسالة فاضية' });
    }

    const messageData = {
      text: hasText ? text.trim() : (hasSticker ? String(sticker).trim() : ''),
      media_url: media_url || '',
      media_type: media_type || (hasSticker ? 'sticker' : ''),
      sticker: hasSticker ? String(sticker).trim() : '',
      sender_id: req.uid,
      sender_name: req.requester.name || req.requester.displayName || 'أدمن',
      sender_photo: req.requester.profile_pic || '',
      created_at: Date.now(),
      edited: false,
    };

    const ref = await admin.firestore().collection('admin_chat').add(messageData);

    // إشعار Push للأدمنز التانيين (ما عدا المرسل)
    (async () => {
      try {
        const snap = await admin.firestore()
          .collection('users')
          .where('role', 'in', ['admin', 'super_admin'])
          .get();
        const tokens = snap.docs
          .filter(d => d.id !== req.uid)
          .map(d => d.data().push_token)
          .filter(Boolean);
        if (tokens.length) {
          await sendExpoPush(tokens, {
            title: 'قناة الأدمنز',
            body: `${messageData.sender_name}: ${messageData.text}`.slice(0, 120),
            data: { type: 'admin_chat', message_id: ref.id },
          });
        }
      } catch (err) {
        console.error('admin chat push error:', err.message);
      }
    })();

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


// رفع وسائط لقناة الأدمنز (صورة / صوت)
router.post('/chat/media', verifyToken, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'لا يوجد ملف' });
    const ext = (req.file.originalname.split('.').pop() || 'bin').toLowerCase();
    const key = `admin_chat/media_${Date.now()}.${ext}`;
    const url = await uploadToR2(req.file.buffer, key, req.file.mimetype);
    let media_type = 'file';
    if ((req.file.mimetype || '').startsWith('image/')) media_type = 'image';
    else if ((req.file.mimetype || '').startsWith('audio/')) media_type = 'audio';
    else if ((req.file.mimetype || '').startsWith('video/')) media_type = 'video';
    res.json({ success: true, url, media_type });
  } catch (err) {
    console.error('chat media upload error:', err.message);
    res.status(500).json({ error: err.message || 'فشل رفع الملف' });
  }
});

module.exports = router;
