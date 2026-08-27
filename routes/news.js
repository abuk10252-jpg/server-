const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const db = admin.firestore();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { uploadToR2 } = require('../utils/r2');
const { notifyAllUsers } = require('../utils/push');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 ميجا كافية لمرفقات الأخبار (صور/صوت)
});

// ============ Middlewares ============
async function verifyToken(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// بيحمّل بيانات المستخدم من Firestore ويحطها في req.user
async function loadUser(req, res, next) {
  try {
    const doc = await db.collection('users').doc(req.uid).get();
    req.user = doc.exists ? { id: req.uid, ...doc.data() } : null;
    next();
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
}

async function requireAdmin(req, res, next) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin')) {
    return res.status(403).json({ error: 'Admins only' });
  }
  next();
}

// ============ Helpers ============
function genId() {
  return db.collection('_').doc().id; // Firestore auto-id generator (بدون كتابة فعلية)
}

// ============ CREATE NEWS / POLL / QUIZ ============
router.post('/', verifyToken, loadUser, requireAdmin, async (req, res) => {
  try {
    const {
      type, title, title_ar, content, content_ar,
      image, poll_options, quiz_questions, quiz_time_limit,
    } = req.body;

    if (!title) return res.status(400).json({ error: 'Title required' });

    const data = {
      type: type || 'news',
      title,
      title_ar: title_ar || '',
      content: content || '',
      content_ar: content_ar || '',
      image: image || '',
      created_at: Date.now(),
      created_by: req.uid,
      created_by_name: req.user?.name || req.user?.displayName || 'Admin',
      created_by_photo: req.user?.profile_pic || req.user?.photoURL || '',
      reactions: {},
      user_reactions: {},
      comments: [],
    };

    if (type === 'poll') {
      if (!poll_options || poll_options.length < 2) {
        return res.status(400).json({ error: 'At least 2 poll options required' });
      }
      data.poll_options = poll_options.map(o => ({
        id: genId(),
        text: o.text || '',
        text_ar: o.text_ar || o.text || '',
        votes: 0,
      }));
      data.poll_voters = [];
    }

    if (type === 'quiz') {
      if (!quiz_questions || quiz_questions.length === 0) {
        return res.status(400).json({ error: 'Quiz questions required' });
      }
      data.quiz_questions = quiz_questions;
      data.quiz_time_limit = quiz_time_limit || 10;
      data.quiz_submissions = [];
      data.quiz_results_published = false;
    }

    const ref = await db.collection('news').add(data);

    // إشعار Push حقيقي يبان في شريط إشعارات الموبايل لكل المستخدمين (ما عدا الأدمن اللي نشر)
    notifyAllUsers({
      title: title,
      body: content || title,
      data: { news_id: ref.id, type: data.type },
      excludeUid: req.uid,
    }).catch(err => console.error('push notification error:', err.message));

    return res.json({ success: true, id: ref.id, news: { id: ref.id, ...data } });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to create news' });
  }
});

// ============ LIST NEWS ============
router.get('/', verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection('news').orderBy('created_at', 'desc').get();
    const news = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    return res.json({ news });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load news' });
  }
});

// ============ EDIT NEWS ============
router.put('/:id', verifyToken, loadUser, requireAdmin, async (req, res) => {
  try {
    const { title, content, title_ar, content_ar } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (title_ar !== undefined) updates.title_ar = title_ar;
    if (content_ar !== undefined) updates.content_ar = content_ar;

    await db.collection('news').doc(req.params.id).update(updates);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to update news' });
  }
});

// ============ DELETE NEWS ============
router.delete('/:id', verifyToken, loadUser, requireAdmin, async (req, res) => {
  try {
    await db.collection('news').doc(req.params.id).delete();
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to delete news' });
  }
});

// ============ REACT (لايك/إيموجي) ============
router.post('/:id/react', verifyToken, async (req, res) => {
  try {
    const { reaction } = req.body;
    const ref = db.collection('news').doc(req.params.id);

    const result = await db.runTransaction(async (t) => {
      const doc = await t.get(ref);
      if (!doc.exists) throw new Error('not_found');
      const data = doc.data();
      const reactions = { ...(data.reactions || {}) };
      const userReactions = { ...(data.user_reactions || {}) };

      const previous = userReactions[req.uid];
      if (previous) {
        reactions[previous] = Math.max(0, (reactions[previous] || 0) - 1);
      }

      if (previous === reaction) {
        // نفس الإيموجي تاني = إلغاء التفاعل
        delete userReactions[req.uid];
      } else {
        reactions[reaction] = (reactions[reaction] || 0) + 1;
        userReactions[req.uid] = reaction;
      }

      t.update(ref, { reactions, user_reactions: userReactions });
      return { reactions, user_reactions: userReactions };
    });

    return res.json(result);
  } catch (e) {
    if (e.message === 'not_found') return res.status(404).json({ error: 'News not found' });
    return res.status(500).json({ error: 'Failed to react' });
  }
});

// ============ COMMENT (مع دعم الرد على رسالة - reply_to زي واتساب) ============
router.post('/:id/comment', verifyToken, loadUser, async (req, res) => {
  try {
    const { text, reply_to } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Comment text required' });

    const ref = db.collection('news').doc(req.params.id);
    const comment = {
      id: genId(),
      user_id: req.uid,
      user_name: req.user?.name || req.user?.displayName || 'User',
      user_photo: req.user?.profile_pic || req.user?.photoURL || '',
      text: text.trim(),
      reply_to: reply_to ? { id: reply_to.id, name: reply_to.name, text: reply_to.text } : null,
      created_at: Date.now(),
    };

    await ref.update({
      comments: admin.firestore.FieldValue.arrayUnion(comment),
    });

    return res.json({ success: true, comment });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to add comment' });
  }
});

// ============ VOTE (بوستات الاستطلاع) ============
router.post('/:id/vote', verifyToken, async (req, res) => {
  try {
    const { option_id } = req.body;
    const ref = db.collection('news').doc(req.params.id);

    const result = await db.runTransaction(async (t) => {
      const doc = await t.get(ref);
      if (!doc.exists) throw new Error('not_found');
      const data = doc.data();
      const voters = data.poll_voters || [];

      if (voters.includes(req.uid)) {
        throw new Error('already_voted');
      }

      const options = (data.poll_options || []).map(o =>
        o.id === option_id ? { ...o, votes: (o.votes || 0) + 1 } : o
      );
      const newVoters = [...voters, req.uid];

      t.update(ref, { poll_options: options, poll_voters: newVoters });
      return { poll_options: options, poll_voters: newVoters };
    });

    return res.json(result);
  } catch (e) {
    if (e.message === 'not_found') return res.status(404).json({ error: 'News not found' });
    if (e.message === 'already_voted') return res.status(400).json({ error: 'لقد قمت بالتصويت بالفعل' });
    return res.status(500).json({ error: 'Failed to vote' });
  }
});

// ============ SUBMIT QUIZ ============
router.post('/:id/submit-quiz', verifyToken, loadUser, async (req, res) => {
  try {
    const { answers } = req.body;
    const ref = db.collection('news').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Quiz not found' });

    const data = doc.data();
    if (data.type !== 'quiz') return res.status(400).json({ error: 'Not a quiz post' });

    const submissions = data.quiz_submissions || [];
    if (submissions.some(s => s.user_id === req.uid)) {
      return res.status(400).json({ error: 'لقد قمت بالإجابة على هذا الاختبار بالفعل' });
    }

    let score = 0;
    (data.quiz_questions || []).forEach((q, i) => {
      if (answers[i] === q.correct_answer) score++;
    });

    const submission = {
      user_id: req.uid,
      user_name: req.user?.name || req.user?.displayName || 'User',
      user_photo: req.user?.profile_pic || req.user?.photoURL || '',
      answers,
      score,
      total: data.quiz_questions.length,
      submitted_at: Date.now(),
    };

    const newSubmissions = [...submissions, submission];
    await ref.update({ quiz_submissions: newSubmissions });

    return res.json({ success: true, score, submissions: newSubmissions });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to submit quiz' });
  }
});

// ============ PUBLISH QUIZ RESULTS ============
router.post('/:id/publish-results', verifyToken, loadUser, requireAdmin, async (req, res) => {
  try {
    const quizRef = db.collection('news').doc(req.params.id);
    const quizDoc = await quizRef.get();
    if (!quizDoc.exists) return res.status(404).json({ error: 'Quiz not found' });
    const quiz = quizDoc.data();
    if (quiz.type !== 'quiz') return res.status(400).json({ error: 'Not a quiz' });

    await quizRef.update({ quiz_results_published: true });

    const title = quiz.title || 'اختبار';
    const titleAr = quiz.title_ar || title;
    // منشور في الأخبار: نتيجة الاختبار (مش "تم رفع")
    const resultPost = {
      type: 'quiz_result',
      title: `Result: ${title}`,
      title_ar: `نتيجة: ${titleAr}`,
      content: `Quiz results for "${title}" are now available. Tap to view the full ranking.`,
      content_ar: `نتائج اختبار «${titleAr}» أصبحت متاحة. اضغط لعرض الترتيب الكامل بالأسماء.`,
      image: '',
      created_by: req.user.uid,
      created_by_name: req.user.name || 'Admin',
      created_by_photo: req.user.photo || '',
      created_at: new Date().toISOString(),
      reactions: {},
      user_reactions: {},
      comments: [],
      quiz_id: req.params.id,
      quiz_results_published: true,
    };
    const ref = await db.collection('news').add(resultPost);

    // إشعار اختياري
    try {
      const { notifyAllUsers } = require('../utils/push');
      if (typeof notifyAllUsers === 'function') {
        await notifyAllUsers({
          title: titleAr.startsWith('نتيجة') ? titleAr : `نتيجة: ${titleAr}`,
          body: 'اضغط لعرض نتائج الاختبار',
          data: { type: 'quiz_result', quiz_id: req.params.id },
        });
      }
    } catch (e) {
      console.warn('push after publish-results:', e.message);
    }

    return res.json({ success: true, result_news_id: ref.id });
  } catch (e) {
    console.error('publish-results', e);
    return res.status(500).json({ error: 'Failed to publish results' });
  }
});


// نتائج اختبار منشورة — للطلاب
router.get('/:id/public-results', verifyToken, loadUser, async (req, res) => {
  try {
    const doc = await db.collection('news').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    const quiz = doc.data();
    // لو المنشور من نوع quiz_result، نقرأ quiz_id
    let quizDoc = doc;
    let quizData = quiz;
    if (quiz.type === 'quiz_result' && quiz.quiz_id) {
      quizDoc = await db.collection('news').doc(quiz.quiz_id).get();
      if (!quizDoc.exists) return res.status(404).json({ error: 'Quiz not found' });
      quizData = quizDoc.data();
    }
    if (quizData.type !== 'quiz') return res.status(400).json({ error: 'Not a quiz' });
    if (!quizData.quiz_results_published) {
      return res.status(403).json({ error: 'النتائج لسه ما اتنشرت' });
    }
    const attempts = (quizData.quiz_submissions || []).slice().sort((a, b) => {
      if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
      return (a.time_spent || 0) - (b.time_spent || 0);
    });
    return res.json({
      quiz: {
        id: quizDoc.id,
        title: quizData.title,
        title_ar: quizData.title_ar || quizData.title,
        quiz_results_published: true,
      },
      attempts,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Failed' });
  }
});

// رفع مرفق للخبر (صورة/صوت) - بيرفع على Cloudflare R2 ويرجّع الرابط
router.post('/upload-attachment', verifyToken, loadUser, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'لا يوجد ملف' });

    const ext = (req.file.originalname.split('.').pop() || 'bin').toLowerCase();
    const key = `news_attachments/${Date.now()}_${uuidv4()}.${ext}`;

    const url = await uploadToR2(req.file.buffer, key, req.file.mimetype);

    res.json({ success: true, url });
  } catch (err) {
    console.error('Upload attachment error:', err.message);
    res.status(500).json({ error: err.message || 'فشل رفع المرفق' });
  }
});

module.exports = router;
