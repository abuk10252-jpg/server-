// utils/push.js
// إرسال إشعارات فعلية على الموبايل (تظهر في شريط إشعارات النظام) عبر Expo Push API

const { db } = require("./firebase");

// بيبعت إشعار Push لكل التوكنات المديّة، على دفعات (Expo بيقبل لغاية 100 في الطلب الواحد)
async function sendExpoPush(tokens, { title, body, data }) {
  const validTokens = (tokens || []).filter(
    t => typeof t === "string" && t.startsWith("ExponentPushToken")
  );
  if (validTokens.length === 0) return;

  const chunkSize = 100;
  for (let i = 0; i < validTokens.length; i += chunkSize) {
    const chunk = validTokens.slice(i, i + chunkSize);
    const messages = chunk.map(to => ({
      to,
      title,
      body,
      sound: "default",
      data: data || {},
    }));

    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(messages),
      });
    } catch (err) {
      console.error("Expo push send error:", err.message);
    }
  }
}

// بيجيب كل التوكنات المسجّلة (ممكن نستثني يوزر معيّن، زي اللي عمل الفعل)
async function getAllPushTokens(excludeUid) {
  const snapshot = await db.collection("users").get();
  return snapshot.docs
    .filter(doc => doc.id !== excludeUid)
    .map(doc => doc.data().push_token)
    .filter(Boolean);
}

// بيبعت إشعار Push لكل المستخدمين المسجّلين (ما عدا اللي عمل الفعل نفسه لو محدد)
async function notifyAllUsers({ title, body, data, excludeUid }) {
  const tokens = await getAllPushTokens(excludeUid);
  await sendExpoPush(tokens, { title, body, data });
}

module.exports = { sendExpoPush, getAllPushTokens, notifyAllUsers };
