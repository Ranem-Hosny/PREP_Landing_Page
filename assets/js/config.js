/* ══════════════════════════════════════════════
   PREP — إعدادات الموقع
   الملف الوحيد الذي يتغيّر عند النشر.
   الربط مع الباك إند: قناة الدفع من الموقع (CN-001) —
   راجع docs/BACKEND_CONTRACT.md لقائمة ما قبل الإطلاق.
   ══════════════════════════════════════════════ */
window.PREP_CONFIG = {
  /* 'preview'    : يُظهر شارة المعاينة، والروابط غير المضبوطة معطّلة ظاهرة.
     'production' : يحذف كل رابط غير مضبوط. */
  mode: 'preview',

  api: {
    // ← عنوان الباك إند شاملًا /api/v1. محليًا: docker compose على المنفذ 8000
    baseUrl: 'http://localhost:8000/api/v1',
    language: 'ar',
    timeoutMs: 15000
  },

  checkout: {
    pollIntervalMs: 3000,                // قراءة حالة الطلب
    pollBackoffAfterMs: 30000,           // بعدها تتباطأ القراءة
    pollBackoffIntervalMs: 6000,
    pollTimeoutMs: 120000                // بعدها رسالة «ما زال الطلب قيد المعالجة» لا «نجاح»
  },

  /* null = غير متوفر بعد. في الإنتاج يُحذف أي عنصر رابطه null. */
  links: {
    terms: null,
    privacy: null,
    refund: null,
    supportEmail: null,                  // مثال: 'support@prep.sa' بعد تأكيد الدومين
    appStore: null,                      // يُضاف عند نشر التطبيق
    googlePlay: null                     // يُضاف عند نشر التطبيق
  }
};
