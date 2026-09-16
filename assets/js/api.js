/* ══════════════════════════════════════════════
   PREP — طبقة الاتصال بالباك إند
   ──────────────────────────────────────────────
   قناة الدفع من الموقع (CN-001) — مسارات عامة بلا حساب ولا جلسة:
     GET  /public/web-offers                         العروض المنشورة
     GET  /public/web-offers/:offerId                عرض واحد
     POST /public/web-checkout-attempts              حجز محاولة شراء → checkout_token
     POST /public/web-checkout-attempts/:id/order    إرسال الطلب (202)
     GET  /public/web-checkout-attempts/:id          حالة الطلب

   قواعد الباك إند:
   • credentials: 'omit' دائمًا — لا كوكي ولا Authorization (يُرفض بـ 403).
   • checkout_token يُحفظ في sessionStorage للتبويب نفسه فقط، ويُرسل
     في X-Checkout-Token. لا يوضع في رابط ولا سجل ولا تحليلات.
   ══════════════════════════════════════════════ */
(function () {
  'use strict';

  var cfg = window.PREP_CONFIG || {};
  var apiCfg = cfg.api || {};

  /* ── الأخطاء ─────────────────────────────── */
  function ApiError(code, message, status, details) {
    this.name = 'ApiError';
    this.code = code || 'INTERNAL_ERROR';
    this.message = message || '';
    this.status = status || 0;
    this.details = details || {};
  }
  ApiError.prototype = Object.create(Error.prototype);

  /* ── الطلب ─────────────────────────────── */
  function request(method, path, opts) {
    opts = opts || {};
    var base = (apiCfg.baseUrl || '').replace(/\/$/, '');
    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, apiCfg.timeoutMs || 15000) : null;

    var headers = { 'Accept': 'application/json', 'Accept-Language': apiCfg.language || 'ar' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.token) headers['X-Checkout-Token'] = opts.token;

    return fetch(base + path, {
      method: method,
      headers: headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'omit',
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      return res.text().then(function (text) {
        var json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) {}
        if (res.ok) return json;
        var err = (json && json.error) || {};
        var details = err.details || {};
        var retry = res.headers.get('Retry-After');
        if (retry && details.retry_after == null) details.retry_after = parseInt(retry, 10) || null;
        throw new ApiError(err.code || (res.status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_' + res.status),
          err.message, res.status, details);
      });
    }, function (e) {
      if (timer) clearTimeout(timer);
      throw new ApiError(e && e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK', '', 0);
    });
  }

  /* ── محاولة الشراء المحفوظة (sessionStorage للتبويب نفسه) ── */
  var ATTEMPT_KEY = 'prep.checkout.attempt';

  var Attempt = {
    get: function () {
      try { return JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) || 'null'); }
      catch (e) { return null; }
    },
    set: function (a) {
      try { sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify(a)); } catch (e) {}
      return a;
    },
    update: function (patch) {
      var a = Attempt.get();
      if (!a) return null;
      Object.keys(patch).forEach(function (k) { a[k] = patch[k]; });
      return Attempt.set(a);
    },
    clear: function () {
      try { sessionStorage.removeItem(ATTEMPT_KEY); } catch (e) {}
    },
    // لم تُستخدم بعد ولم تنتهِ صلاحيتها (بهامش دقيقة)
    isFresh: function (a) {
      return !!(a && !a.submitted && a.expires_at && new Date(a.expires_at).getTime() - Date.now() > 60000);
    }
  };

  function path(id) { return encodeURIComponent(id); }

  window.PrepAPI = {
    ApiError: ApiError,
    Attempt: Attempt,

    listOffers: function () {
      return request('GET', '/public/web-offers').then(function (r) { return (r && r.items) || []; });
    },
    getOffer: function (offerId) {
      return request('GET', '/public/web-offers/' + path(offerId));
    },

    createAttempt: function () {
      return request('POST', '/public/web-checkout-attempts', { body: {} });
    },
    // الحقول الخمسة فقط — أي حقل إضافي يرفضه الباك إند بـ 422
    submitOrder: function (attemptId, token, order) {
      return request('POST', '/public/web-checkout-attempts/' + path(attemptId) + '/order', {
        token: token,
        body: {
          offer_id: order.offer_id,
          offer_version_id: order.offer_version_id,
          recipient_email: order.recipient_email,
          recipient_email_confirmation: order.recipient_email_confirmation,
          accept_terms: true
        }
      });
    },
    getAttemptStatus: function (attemptId, token) {
      return request('GET', '/public/web-checkout-attempts/' + path(attemptId), { token: token });
    }
  };
})();
