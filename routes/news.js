const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const db = admin.firestore();

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
      created_by_name: req.user?.displayName || req.user?.name || 'Admin',
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
      user_name: req.user?.displayName || req.user?.name || 'User',
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
      user_name: req.user?.displayName || req.user?.name || 'User',
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
    await db.collection('news').doc(req.params.id).update({ quiz_results_published: true });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to publish results' });
  }
});

module.exports = router;
