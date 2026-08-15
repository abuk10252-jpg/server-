const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { db, auth } = require("./utils/firebase");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const authRoutes = require("./routes/auth");
const newsRoutes = require("./routes/news");
const coursesRoutes = require("./routes/courses");
const adminRoutes = require("./routes/admin");
const superAdminRoutes = require("./routes/superAdmin");

app.use("/api/auth", authRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/courses", coursesRoutes);
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/admin", adminRoutes);
app.use("/api/super-admin", superAdminRoutes);

// البحث - يبحث في عناوين المقررات
// ملاحظة: routes/quiz.js و routes/files.js موجودين في الريبو لكن مش متوصلين هنا
// لإن endpoints بتاعتهم بتستخدم مسارات وبنية بيانات مختلفة عن اللي الفرونت إند
// الحالي بيناديها فعليًا (submit-quiz/comment/react/vote بقوا جوه routes/news.js
// ورفع الملفات بقى جوه routes/courses.js). سيبناهم من غير ما نلغيهم لحد ما
// نحتاجهم أو نوحّدهم مع الشكل الجديد.
app.get("/api/search", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim().toLowerCase();
    if (!q) return res.json({ courses: [] });

    const snapshot = await db.collection("courses").get();
    const courses = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(c =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.name_ar || "").toLowerCase().includes(q) ||
        (c.description || "").toLowerCase().includes(q)
      );

    return res.json({ courses });
  } catch (e) {
    return res.status(500).json({ error: "Search failed" });
  }
});

// Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "Server is running ✅" });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
