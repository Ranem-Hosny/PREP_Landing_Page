/* ══════════════════════════════════════════════
   PREP — أدوات مشتركة بين الصفحات
   تنسيق · رسائل الأخطاء · الروابط · شارة المعاينة
   ══════════════════════════════════════════════ */
(function () {
  'use strict';

  var cfg = window.PREP_CONFIG || {};
  var Prep = window.Prep = {};

  /* ── تنسيق ─────────────────────────────── */
  Prep.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  // المبالغ بالهللة من الباك إند دائمًا: 22885 = 228.85
  Prep.money = function (halalas) {
    var v = (halalas || 0) / 100;
    var hasFraction = Math.round(halalas) % 100 !== 0;
    return v.toLocaleString('en-US', { minimumFractionDigits: hasFraction ? 2 : 0, maximumFractionDigits: 2 });
  };

  Prep.currency = function (money) {
    return !money || money.currency === 'SAR' ? 'ر.س' : Prep.esc(money.currency);
  };

  function plural(n, one, two, few, many) {
    if (n === 1) return one;
    if (n === 2) return two;
    return n <= 10 ? n + ' ' + few : n + ' ' + many;
  }

  /* مدة الوصول من العرض: access_unit/access_value = null تعني وصولًا دائمًا (الدورات) */
  Prep.accessLabel = function (offer) {
    var n = offer && offer.access_value;
    if (!offer || !offer.access_unit || !n) return 'وصول دائم';
    if (offer.access_unit === 'months') {
      if (n % 12 === 0) { var y = n / 12; return plural(y, 'سنة', 'سنتان', 'سنوات', 'سنة'); }
      return plural(n, 'شهر', 'شهران', 'أشهر', 'شهرًا');
    }
    return plural(n, 'يوم', 'يومان', 'أيام', 'يومًا');
  };

  Prep.accessSentence = function (offer) {
    return offer && offer.access_unit && offer.access_value
      ? Prep.accessLabel(offer) + ' من تأكيد الدفع'
      : 'وصول دائم دون انتهاء';
  };

  Prep.kindLabel = function (offer) { return offer && offer.item_type === 'package' ? 'باقة' : 'دورة'; };

  Prep.taxLabel = function (offer) {
    return offer && offer.tax_inclusive ? 'شامل ضريبة القيمة المضافة' : 'تُضاف ضريبة القيمة المضافة';
  };

  /* ── رسائل الأخطاء ─────────────────────────
     حسب رمز الباك إند (code) — لا نقرأ message أبدًا. */
  var MESSAGES = {
    NETWORK: 'تعذّر الاتصال بالخادم. تحقّق من اتصالك بالإنترنت ثم حاول مرة أخرى.',
    TIMEOUT: 'استغرق الطلب وقتًا أطول من المعتاد. حاول مرة أخرى.',
    INTERNAL_ERROR: 'حدث خلل في الخادم. حاول مرة أخرى بعد دقيقة.',
    VALIDATION_ERROR: 'راجع الحقول المظلّلة ثم أعد الإرسال.',
    WEB_CHECKOUT_DISABLED: 'الشراء من الموقع متوقف مؤقتًا. حاول لاحقًا، أو اشترِ من داخل التطبيق.',
    WEB_OFFER_NOT_FOUND: 'هذا العرض لم يعد متاحًا للشراء.',
    CHECKOUT_UNAVAILABLE: 'تعذّر إتمام هذا الشراء. تأكد أنك كتبت بريد حساب PREP موجود في التطبيق، أو تواصل مع الدعم.',
    QUOTE_EXPIRED: 'تغيّرت تفاصيل العرض أو سعره منذ فتحت الصفحة. راجع الإجمالي الجديد ثم أكّد الشراء.',
    IDEMPOTENCY_CONFLICT: 'غيّرت البيانات بعد إرسال الطلب، فبدأنا طلبًا جديدًا. أكّد الشراء مرة أخرى.',
    CHECKOUT_NOT_FOUND: 'انتهت جلسة الشراء هذه. ابدأ من جديد من صفحة الباقات.',
    RATE_LIMITED: 'محاولات كثيرة خلال وقت قصير. انتظر {retry_after} ثانية ثم حاول مرة أخرى.',
    ORIGIN_NOT_ALLOWED: 'تعذّر إتمام الطلب بسبب إعدادات الموقع. تواصل مع الدعم.',
    ACCOUNT_CREDENTIALS_NOT_ACCEPTED: 'تعذّر إتمام الطلب بسبب إعدادات الموقع. تواصل مع الدعم.'
  };

  Prep.message = function (err) {
    var code = err && err.code;
    var tpl = MESSAGES[code] || MESSAGES.INTERNAL_ERROR;
    var d = (err && err.details) || {};
    if (code === 'RATE_LIMITED' && d.retry_after == null) return 'محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.';
    return tpl.replace(/\{(\w+)\}/g, function (_, k) { return d[k] != null ? d[k] : ''; });
  };

  /* ── الروابط (LP-09) ───────────────────────
     <a data-link="terms"> تأخذ عنوانها من config.links.
     الرابط غير المضبوط: معطّل في المعاينة، محذوف في الإنتاج. */
  var PENDING_TITLE = 'يُضاف هذا الرابط قبل الإطلاق';

  Prep.linkFor = function (key) {
    var v = cfg.links && cfg.links[key];
    if (!v) return null;
    return key === 'supportEmail' ? 'mailto:' + v : v;
  };

  Prep.applyLinks = function (root) {
    (root || document).querySelectorAll('[data-link]').forEach(function (el) {
      var key = el.getAttribute('data-link');
      var href = Prep.linkFor(key);
      if (href) {
        el.setAttribute('href', href);
        el.classList.remove('is-pending');
        el.removeAttribute('aria-disabled');
        if (/^https?:/.test(href)) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener'); }
        if (key === 'supportEmail' && el.hasAttribute('data-link-text')) el.textContent = cfg.links.supportEmail;
        return;
      }
      if (cfg.mode === 'production') {
        var wrap = el.closest('[data-link-wrap]');
        (wrap || el).remove();
        return;
      }
      el.removeAttribute('href');
      el.classList.add('is-pending');
      el.setAttribute('aria-disabled', 'true');
      el.setAttribute('title', PENDING_TITLE);
    });
    // حاوية كل روابطها حُذفت (مثل أزرار المتاجر) تُحذف بعنوانها
    if (cfg.mode === 'production') {
      (root || document).querySelectorAll('[data-link-host]').forEach(function (host) {
        if (!host.querySelector('[data-link]')) host.remove();
      });
    }
  };

  /* ── شارة المعاينة ─────────────────────────
     قائمة حيّة بما يلزم قبل الإطلاق — تظهر فقط في وضع المعاينة. */
  function previewBadge() {
    if (cfg.mode === 'production') return;
    var items = [];
    var base = (cfg.api && cfg.api.baseUrl) || '';
    if (!/^https:\/\//.test(base)) items.push('الباك إند محلي: <b dir="ltr">' + Prep.esc(base) + '</b>');
    var names = { terms: 'الشروط والأحكام', privacy: 'سياسة الخصوصية', refund: 'سياسة الاسترداد', supportEmail: 'بريد الدعم', appStore: 'App Store', googlePlay: 'Google Play' };
    var missing = Object.keys(names).filter(function (k) { return !(cfg.links && cfg.links[k]); }).map(function (k) { return names[k]; });
    if (missing.length) items.push('روابط غير مضبوطة: ' + missing.join('، '));
    if (!items.length) return;

    var el = document.createElement('details');
    el.className = 'preview';
    el.innerHTML = '<summary>معاينة · ' + items.length + ' قبل الإطلاق</summary><ul>' +
      items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul>';
    document.body.appendChild(el);
  }

  Prep.storeButtons = function () {
    var apple = Prep.linkFor('appStore'), google = Prep.linkFor('googlePlay');
    if (!apple && !google) {
      return '<p class="stores-pending">تطبيق الطالب يُنشر قريبًا على App Store وGoogle Play، وستجد رابطيهما هنا.</p>';
    }
    var html = '<div class="storebtns">';
    if (apple) html += '<a class="storebtn" href="' + Prep.esc(apple) + '" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.9-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.2 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.7-2.2c.9-1.2 1.2-2.5 1.3-2.5s-2.4-1-2.4-3.5zM14.2 5.6c.6-.8 1-1.9.9-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-.9 2.9 1 .1 2-.5 2.7-1.3z"/></svg><span><small>حمّله من</small><b>App Store</b></span></a>';
    if (google) html += '<a class="storebtn" href="' + Prep.esc(google) + '" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3.2v17.6c0 .5.5.8.9.6l9.6-5.5-3-3zM16.3 10.7 6.4 5l6.6 6.6zM6.4 19l9.9-5.7-2.9-2.9zM17.7 11.5l2.8 1.6c.6.3.6 1.2 0 1.5l-2.8 1.6-3-2.4z"/></svg><span><small>حمّله من</small><b>Google Play</b></span></a>';
    return html + '</div>';
  };

  /* ── تشغيل على كل الصفحات ─────────────── */
  function boot() {
    Prep.applyLinks();
    previewBadge();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
