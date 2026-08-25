UofK Chem - إصلاح الإشعارات (السيرفر 3xn9)
==========================================
ارفع هذا المجلد كاملاً على خدمة Render: server-3xn9

التعديلات:
- routes/auth.js : حفظ push_token بـ set+merge + لوق
- routes/admin.js : إشعار Push عند رسالة قناة الأدمنز
- utils/push.js : channelId + priority high

Deploy على Render ثم اختبر بنشر خبر وراقب اللوق:
  📤 push: هبعت إشعار لـ X توكن
