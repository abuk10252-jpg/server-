const express = require("express");
const cors = require("cors");

// أول حاجة: حمّل firebase.js
require("./utils/firebase");

// بعدين: حمّل seedSuperAdmin
const seedSuperAdmin = require("./utils/seedSuperAdmin");

const app = express();
app.use(cors());
app.use(express.json());

// شغّل السوبر أدمن بعد ما firebase اتعمل ليهو initialize
seedSuperAdmin();

// ربط المسارات
app.use("/api/auth", require("./routes/auth"));
app.use("/api/files", require("./routes/files"));

app.get("/", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
