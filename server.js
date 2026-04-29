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

app.use("/api/auth", authRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/courses", coursesRoutes);

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
