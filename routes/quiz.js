const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const PDFDocument = require('pdfkit');

// Middleware
async function verifyToken(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });

    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

async function loadUser(req, res, next) {
  try {
    const snap = await admin.firestore().collection('users').doc(req.uid).get();
    req.user = snap.data();
    next();
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
}

// تسجيل نتيجة الكويز
router.post('/quiz/submit/:quizId', verifyToken, loadUser, async (req, res) => {
  try {
    const { quizId } = req.params;
    const { answers, time_spent } = req.body;

    const quizRef = admin.firestore().collection('news').doc(quizId);
    const quizDoc = await quizRef.get();
    const quiz = quizDoc.data();

    if (!quiz || quiz.type !== 'quiz')
      return res.status(404).json({ error: 'Quiz not found' });

    let score = 0;
    quiz.quiz_questions.forEach((q, i) => {
      if (answers[i] === q.correct_answer) score++;
    });

    const attempt = {
      user_id: req.uid,
      name: req.user.name,
      score,
      total: quiz.quiz_questions.length,
      time_spent: time_spent || 0,
      created_at: Date.now(),
    };

    const current = quiz.quiz_results?.attempts || [];
    current.push(attempt);

    await quizRef.update({
      quiz_results: { attempts: current },
    });

    return res.json({ success: true, score });
  } catch {
    return res.status(500).json({ error: 'Failed to submit quiz' });
  }
});

// جلب نتائج الكويز
router.get('/quiz/:quizId/results', verifyToken, loadUser, async (req, res) => {
  try {
    const { quizId } = req.params;

    const quizDoc = await admin.firestore().collection('news').doc(quizId).get();
    const quiz = quizDoc.data();

    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    if (req.user.role !== 'super_admin' && quiz.created_by !== req.uid)
      return res.status(403).json({ error: 'Not allowed' });

    const attempts = quiz.quiz_results?.attempts || [];
    attempts.sort((a, b) => b.score - a.score);

    return res.json({ quiz: { id: quizId, title: quiz.title }, attempts });
  } catch {
    return res.status(500).json({ error: 'Failed to load results' });
  }
});

// PDF
router.get('/quiz/:quizId/results/pdf', verifyToken, loadUser, async (req, res) => {
  try {
    const { quizId } = req.params;

    const quizDoc = await admin.firestore().collection('news').doc(quizId).get();
    const quiz = quizDoc.data();

    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    if (req.user.role !== 'super_admin' && quiz.created_by !== req.uid)
      return res.status(403).json({ error: 'Not allowed' });

    const attempts = (quiz.quiz_results?.attempts || []).sort((a, b) => b.score - a.score);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="quiz-${quizId}-results.pdf"`);

    const doc = new PDFDocument();
    doc.pipe(res);

    doc.fontSize(20).text(`Quiz Results: ${quiz.title}`, { underline: true });
    doc.moveDown();

    attempts.forEach((a, i) => {
      doc.fontSize(12).text(
        `${i + 1}. ${a.name} — ${a.score}/${a.total} (time: ${a.time_spent}s)`
      );
    });

    doc.end();
  } catch {
    return res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// جلب كل الكويزات التي أنشأها الأدمن
router.get('/my-quizzes', verifyToken, loadUser, async (req, res) => {
  try {
    const snap = await admin.firestore()
      .collection('news')
      .where('type', '==', 'quiz')
      .where('created_by', '==', req.uid)
      .get();

    const quizzes = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    return res.json({ quizzes });
  } catch {
    return res.status(500).json({ error: 'Failed to load quizzes' });
  }
});

module.exports = router;
