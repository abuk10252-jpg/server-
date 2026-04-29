// utils/notifications.js

import { getFirestore } from "firebase-admin/firestore";
import fetch from "node-fetch";

// تسجيل الإشعار في Firestore
export async function createNotification({ title, body, file_path, file_type, course_id }) {
  const db = getFirestore();

  await db.collection("notifications").add({
    title,
    body,
    file_path,
    file_type,
    course_id,
    created_at: Date.now(),
    read: false
  });
}

// إرسال Push Notification عبر Expo
export async function sendPushNotification({ to, title, body, data }) {
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      to,
      title,
      body,
      sound: "default",
      data
    })
  });
}
