// utils/push.js
// إرسال إشعارات فعلية على الموبايل (تظهر في شريط إشعارات النظام) عبر Expo Push API

const { db } = require("./firebase");

// بيبعت إشعار Push لكل التوكنات المديّة، على دفعات (Expo بيقبل لغاية 100 في الطلب الواحد)
async function sendExpoPush(tokens, { title, body, data }) {
  const validTokens = (tokens || []).filter(
    t => typeof t === "string" && t.startsWith("ExponentPushToken")
  );
  if (validTokens.length === 0) {
    console.warn("⚠️ push: مفيش أي توكن صالح للإرسال - يعني ولا مستخدم عندو push_token متسجل في قاعدة البيانات");
    return;
  }

  console.log(`📤 push: هبعت إشعار لـ ${validTokens.length} توكن`);

  const chunkSize = 100;
  for (let i = 0; i < validTokens.length; i += chunkSize) {
    const chunk = validTokens.slice(i, i + chunkSize);
    const messages = chunk.map(to => ({
      to,
      title,
      body,
      sound: "default",
      channelId: "default",
      priority: "high",
      data: data || {},
    }));

    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(messages),
      });

      const result = await res.json();
      // مهم: Expo بيرجع status 200 حتى لو فيه أخطاء فردية في كل توكن -
      // لازم نفحص كل "ticket" على حدة عشان نعرف السبب الحقيقي لو فشل
      const tickets = result?.data || [];
      tickets.forEach((ticket, idx) => {
        if (ticket.status === "error") {
          console.error(
            `❌ push فشل للتوكن ${chunk[idx]}: ${ticket.message} (${ticket.details?.error || "unknown"})`
          );
        } else {
          console.log(`✅ push اتقبل للتوكن ${chunk[idx]}`);
        }
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
