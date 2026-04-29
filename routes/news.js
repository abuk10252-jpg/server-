const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// Middleware: verify token + admin only
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

async function requireAdmin(req, res, next) {
  try {
    const doc = await admin.firestore().collection('users').doc(req.uid).get();
    const user = doc.data();

    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
      return res.status(403).json({ error: 'Admins only' });
    }

    next();
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
}

// CREATE NEWS / POLL / QUIZ
router.post('/news', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { type, title, content, poll_options, quiz_questions, quiz_time_limit } = req.body;

    if (!title) return res.status(400).json({ error: 'Title required' });

    const data = {
      type,
      title,
      content: content || '',
      created_at: Date.now(),
      created_by: req.uid,
    };

    if (type === 'poll') {
      if (!poll_options || poll_options.length < 2) {
        return res.status(400).json({ error: 'At least 2 poll options required' });
      }
      data.poll_options = poll_options;
      data.poll_votes = poll_options.map(() => 0);
    }

    if (type === 'quiz') {
      if (!quiz_questions || quiz_questions.length === 0) {
        return res.status(400).json({ error: 'Quiz questions required' });
      }
      data.quiz_questions = quiz_questions;
      data.quiz_time_limit = quiz_time_limit || 10;
    }

    const ref = await admin.firestore().collection('news').add(data);

    return res.json({ success: true, id: ref.id });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to create news' });
  }
});

module.exports = router;
