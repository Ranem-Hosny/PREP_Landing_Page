/* ══════════════════════════════════════════════
   PREP — إتمام الشراء (CN-001)
   العرض → بريد حساب التطبيق مرتين + الموافقة على الشروط (LP-03 / LP-04)
   → صفحة ميسّر المستضافة → قراءة حالة الطلب من الباك إند (LP-05)
   → تعليمات ما بعد الدفع (LP-06)

   قواعد ثابتة:
   • لا تُعرض «تم الدفع» إلا إذا قال الباك إند status = confirmed.
   • معاملات رابط العودة من ميسّر لا تُقرأ أبدًا — الحالة من المحاولة المحفوظة فقط.
   • checkout_token في sessionStorage للتبويب نفسه، لا في رابط ولا سجل.
   ══════════════════════════════════════════════ */
(function () {
  'use strict';

  var cfg = window.PREP_CONFIG;
  var api = window.PrepAPI;
  var Attempt = api.Attempt;
  var Prep = window.Prep;
  var esc = Prep.esc;

  var panel = document.getElementById('panel');
  var summary = document.getElementById('summary');
  var stepsEl = document.getElementById('steps');

  var params = new URLSearchParams(location.search);
  var offer = null;      // العرض المعروض (من GET /web-offers/:id أو من رد الحالة)
  var status = null;     // آخر رد حالة
  var view = null;       // الشاشة المعروضة الآن — لا نعيد رسمها مع كل قراءة

  var RESUME_GRACE_MS = 15000;   // بعد العودة من ميسّر: مهلة قبل عرض «أكمل الدفع»
  var TERMINAL = { confirmed: 1, unavailable: 1, refunded: 1, contact_support: 1 };
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* ── أدوات العرض ─────────────────────────── */
  var STEP_ORDER = ['details', 'pay', 'done'];

  function setStep(step, finished) {
    var idx = STEP_ORDER.indexOf(step);
    stepsEl.querySelectorAll('.steps__i').forEach(function (li, i) {
      li.classList.toggle('is-done', i < idx || (finished && i === idx));
      li.classList.toggle('is-on', i === idx && !finished);
      if (i === idx) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
  }

  function render(name, html, focus) {
    view = name;
    panel.innerHTML = html;
    Prep.applyLinks(panel);
    if (focus !== false) {
      var h = panel.querySelector('.panel__h');
      (h || panel).setAttribute('tabindex', '-1');
      (h || panel).focus({ preventScroll: true });
    }
  }

  function loading(text) {
    render('loading', '<div class="panel__loading"><span class="spin" aria-hidden="true"></span>' + esc(text) + '</div>', false);
  }

  function on(sel, fn) {
    var el = panel.querySelector(sel);
    if (el) el.addEventListener('click', fn);
  }

  // لا نُبقي في شريط العنوان أي معاملات أضافها ميسّر عند العودة
  function setQuery(offerId) {
    history.replaceState(null, '', 'checkout.html' + (offerId ? '?offer=' + encodeURIComponent(offerId) : ''));
  }

  function supportHtml(s) {
    var c = s && s.support_contact;
    if (c) {
      return /@/.test(c)
        ? '<a href="mailto:' + esc(c) + '"><bdi dir="ltr">' + esc(c) + '</bdi></a>'
        : '<bdi dir="ltr">' + esc(c) + '</bdi>';
    }
    return '<a data-link="supportEmail">راسل الدعم</a>';
  }

  function referenceHtml(s) {
    return s && s.support_reference
      ? '<div class="receipt"><p>رقم المرجع <bdi dir="ltr">' + esc(s.support_reference) + '</bdi></p>' +
        '<p class="muted">اذكره عند التواصل مع الدعم.</p></div>'
      : '';
  }

  /* ── الملخّص ─────────────────────────────
     الأرقام كما يرسلها الباك إند — لا حساب في المتصفح. */
  function renderSummary() {
    if (!offer) { summary.hidden = true; return; }
    var total = (status && status.total) || offer.total;
    var courses = offer.item_type === 'package' ? (offer.courses || []) : [];
    var wide = !window.matchMedia('(max-width:940px)').matches;

    summary.innerHTML =
      '<p class="sum__kind">' + Prep.kindLabel(offer) + '</p>' +
      '<h2 class="sum__t">' + esc(offer.name) + '</h2>' +
      '<dl class="sum__terms">' +
        '<div><dt>مدة الوصول</dt><dd>' + esc(Prep.accessSentence(offer)) + '</dd></div>' +
        '<div><dt>التجديد</dt><dd>دفعة واحدة — بدون تجديد تلقائي</dd></div>' +
        (status && status.support_reference ? '<div><dt>رقم المرجع</dt><dd><bdi dir="ltr">' + esc(status.support_reference) + '</bdi></dd></div>' : '') +
      '</dl>' +
      (courses.length
        // على الشاشات الضيقة يأتي الملخّص فوق النموذج — نطوي القائمة حتى لا تدفعه بعيدًا
        ? '<details class="sum__feat"' + (wide ? ' open' : '') + '><summary>الدورات المشمولة (' + courses.length + ')</summary><ul>' +
            courses.map(function (c) { return '<li>' + esc(c.name) + '</li>'; }).join('') +
          '</ul></details>'
        : '') +
      '<dl class="sum__money">' +
        '<div><dt>السعر قبل الضريبة</dt><dd><bdi>' + Prep.money(offer.subtotal.amount) + '</bdi> ' + Prep.currency(offer.subtotal) + '</dd></div>' +
        '<div><dt>ضريبة القيمة المضافة</dt><dd><bdi>' + Prep.money(offer.vat.amount) + '</bdi> ' + Prep.currency(offer.vat) + '</dd></div>' +
        '<div class="sum__total"><dt>الإجمالي</dt><dd><b>' + Prep.money(total.amount) + '</b> ' + Prep.currency(total) + '</dd></div>' +
      '</dl>' +
      '<p class="sum__hint">' + esc(Prep.taxLabel(offer)) + '. هذا هو المبلغ الذي تدفعه في صفحة ميسّر.</p>';
    summary.hidden = false;
  }

  /* ══════════════ حالات بلا طلب ══════════════ */

  function renderNoOffer(message) {
    summary.hidden = true;
    setStep('details');
    render('no-offer',
      '<div class="state">' +
        '<h1 class="panel__h">' + esc(message || 'لم تختر دورة بعد') + '</h1>' +
        '<p class="panel__lead">اختر الدورة أو الباقة التي تناسبك من صفحة الباقات، ثم اضغط زر الشراء.</p>' +
        '<div class="acts"><a class="btn btn--gold" href="index.html#plans">اذهب إلى الباقات</a></div>' +
      '</div>'
    );
  }

  // عودة بلا محاولة محفوظة (متصفح آخر أو تبويب مُغلق): إرشاد عام — لا بحث عن طلب بالبريد
  function renderNoSession() {
    summary.hidden = true;
    setStep('done');
    render('no-session',
      '<div class="state">' +
        '<span class="bubble bubble--pending" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 2"/></svg></span>' +
        '<h1 class="panel__h">لا نستطيع عرض حالة الطلب في هذه النافذة</h1>' +
        '<p class="panel__lead">تظهر حالة الطلب في التبويب الذي بدأت منه الشراء فقط. إن اكتمل دفعك فافتح تطبيق PREP بحسابك وستجد مشترياتك مفعّلة، ويصلك إيصال الشراء على بريدك.</p>' +
        '<p class="muted">لا تكرر الدفع. إن احتجت مساعدة، تواصل مع الدعم واذكر رقم المرجع الموجود في الإيصال.</p>' +
      '</div>' +
      '<div class="acts">' +
        '<a class="btn btn--gold" href="account.html">أين أجد مشترياتي؟</a>' +
        '<a class="btn btn--outline" href="index.html#plans">العودة إلى الباقات</a>' +
      '</div>'
    );
  }

  function renderError(err, retry) {
    render('error',
      '<div class="state">' +
        '<h1 class="panel__h">تعذّر إكمال الخطوة</h1>' +
        '<p class="panel__lead">' + esc(Prep.message(err)) + '</p>' +
        '<div class="acts"><button class="btn btn--gold" type="button" data-act="retry">حاول مرة أخرى</button>' +
        '<a class="btn btn--outline" href="index.html#plans">العودة إلى الباقات</a></div>' +
      '</div>'
    );
    on('[data-act=retry]', retry);
  }

  /* ══════════════ النموذج ══════════════ */

  function ensureAttempt() {
    var a = Attempt.get();
    if (Attempt.isFresh(a)) return Promise.resolve(a);
    return api.createAttempt().then(function (r) {
      return Attempt.set({ attempt_id: r.attempt_id, checkout_token: r.checkout_token, expires_at: r.expires_at, submitted: false });
    });
  }

  function payLabel() {
    return 'تابع إلى الدفع — ' + Prep.money(offer.total.amount) + ' ' + Prep.currency(offer.total);
  }

  function renderForm(notice, values) {
    status = null;
    values = values || {};
    setStep('details');
    renderSummary();

    render('form',
      '<h1 class="panel__h">اكتب بريد حسابك في التطبيق</h1>' +
      '<p class="panel__lead">نفعّل الشراء على حساب PREP المسجّل بهذا البريد. لا يوجد حساب منفصل للموقع.</p>' +
      (notice ? '<p class="notice" role="alert">' + esc(notice) + '</p>' : '') +
      '<form class="order" novalidate>' +
        '<label class="field">' +
          '<span class="field__l">بريد حسابك في تطبيق PREP</span>' +
          '<input class="field__i" type="email" name="email" inputmode="email" autocomplete="email" dir="ltr" ' +
            'placeholder="name@example.com" maxlength="320" required aria-describedby="emailErr">' +
          '<span class="field__err" id="emailErr" hidden></span>' +
        '</label>' +
        '<label class="field">' +
          '<span class="field__l">أعد كتابة البريد</span>' +
          '<input class="field__i" type="email" name="confirm" inputmode="email" autocomplete="off" dir="ltr" ' +
            'placeholder="name@example.com" maxlength="320" required aria-describedby="confirmHelp confirmErr">' +
          '<span class="field__help" id="confirmHelp">اكتبه مرة ثانية. خطأ حرف واحد قد يفعّل الدورة على حساب شخص آخر.</span>' +
          '<span class="field__err" id="confirmErr" hidden></span>' +
        '</label>' +

        '<div class="terms">' +
          '<p class="terms__h">شروط الشراء</p>' +
          '<div class="terms__x" tabindex="0" role="region" aria-label="نص شروط الشراء">' + esc(offer.terms) + '</div>' +
        '</div>' +
        '<label class="check">' +
          '<input type="checkbox" name="accept" required aria-describedby="acceptErr">' +
          '<span class="check__b" aria-hidden="true"></span>' +
          '<span class="check__t">قرأت شروط الشراء وأوافق عليها' +
            '<span data-link-wrap>، و<a data-link="terms">الشروط والأحكام</a></span>' +
            '<span data-link-wrap> و<a data-link="refund">سياسة الاسترداد</a></span>.</span>' +
        '</label>' +
        '<span class="field__err" id="acceptErr" hidden></span>' +

        '<p class="field__err" data-form-err role="alert" hidden></p>' +
        '<button class="btn btn--gold btn--full" type="submit">' + esc(payLabel()) + '</button>' +
        '<p class="secure-note">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>' +
          'ننقلك إلى صفحة الدفع الآمنة من ميسّر (Apple Pay · mada · Visa). لا تمر بيانات بطاقتك بخوادم PREP.' +
        '</p>' +
      '</form>' +
      '<details class="noacc">' +
        '<summary>ليس لديك حساب في التطبيق بعد؟</summary>' +
        '<p>الشراء يُفعَّل على حساب موجود في تطبيق PREP. التطبيق يُنشر قريبًا على المتجرين، وحتى ذلك الحين تواصل مع الدعم قبل الشراء.</p>' +
        Prep.storeButtons() +
      '</details>'
    , !notice ? false : true);

    var form = panel.querySelector('form');
    if (values.email) form.email.value = values.email;
    if (values.confirm) form.confirm.value = values.confirm;
    if (values.accept) form.accept.checked = true;
    if (!notice) form.email.focus({ preventScroll: true });

    // نحجز المحاولة قبل الإرسال: إن ضاع رد الطلب نعيد المحاولة نفسها فنحصل على الطلب نفسه
    ensureAttempt().catch(function (err) {
      if (err.code === 'WEB_CHECKOUT_DISABLED') formError(form, Prep.message(err));
    });

    ['email', 'confirm'].forEach(function (n) {
      form[n].addEventListener('input', function () { fieldError(form, n, ''); formError(form, ''); });
    });
    form.accept.addEventListener('change', function () { fieldError(form, 'accept', ''); });
    form.addEventListener('submit', function (e) { e.preventDefault(); submit(form); });
  }

  var FIELD_ERR_ID = { email: 'emailErr', confirm: 'confirmErr', accept: 'acceptErr' };

  function fieldError(form, name, msg) {
    var el = panel.querySelector('#' + FIELD_ERR_ID[name]);
    el.textContent = msg || '';
    el.hidden = !msg;
    form[name].setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  function formError(form, msg) {
    var el = form.querySelector('[data-form-err]');
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function busy(btn, isBusy) {
    btn.disabled = isBusy;
    btn.classList.toggle('is-busy', isBusy);
  }

  function readForm(form) {
    return { email: form.email.value.trim(), confirm: form.confirm.value.trim(), accept: form.accept.checked };
  }

  function validate(form, v) {
    var first = null;
    function bad(n, msg) { fieldError(form, n, msg); if (!first) first = form[n]; }
    if (!EMAIL_RE.test(v.email)) bad('email', 'اكتب بريدًا إلكترونيًا صحيحًا، مثل name@example.com.');
    if (!v.confirm) bad('confirm', 'أعد كتابة البريد للتأكيد.');
    else if (v.confirm.toLowerCase() !== v.email.toLowerCase()) bad('confirm', 'البريدان غير متطابقين. اكتب البريد نفسه في الحقلين.');
    if (!v.accept) bad('accept', 'وافق على شروط الشراء للمتابعة.');
    if (first) first.focus();
    return !first;
  }

  function submit(form, retried) {
    var v = readForm(form);
    formError(form, '');
    if (!validate(form, v)) return;

    var btn = form.querySelector('button[type=submit]');
    busy(btn, true);

    ensureAttempt().then(function (a) {
      return api.submitOrder(a.attempt_id, a.checkout_token, {
        offer_id: offer.offer_id,
        offer_version_id: offer.offer_version_id,
        recipient_email: v.email,
        recipient_email_confirmation: v.confirm
      });
    }).then(function (s) {
      Attempt.update({ submitted: true, offer_id: offer.offer_id, email: v.email.toLowerCase() });
      // بعد الإرسال لا يبقى ?offer= في الرابط: إعادة التحميل تعرض حالة الطلب لا نموذجًا جديدًا
      setQuery(null);
      track(s, 'submit');
    }, function (err) {
      busy(btn, false);
      switch (err.code) {
        case 'VALIDATION_ERROR':
          var d = err.details || {};
          if (d.recipient_email) fieldError(form, 'email', 'اكتب بريدًا إلكترونيًا صحيحًا، مثل name@example.com.');
          if (d.recipient_email_confirmation) fieldError(form, 'confirm', 'البريدان غير متطابقين. اكتب البريد نفسه في الحقلين.');
          if (d.accept_terms) fieldError(form, 'accept', 'وافق على شروط الشراء للمتابعة.');
          if (!d.recipient_email && !d.recipient_email_confirmation && !d.accept_terms) formError(form, Prep.message(err));
          return;

        case 'QUOTE_EXPIRED':
          // السعر أو الشروط تغيّرت: نعرض العرض الحالي ونطلب الموافقة من جديد
          loading('نحدّث تفاصيل العرض…');
          api.getOffer(offer.offer_id).then(function (fresh) {
            offer = fresh;
            renderForm(Prep.message(err), { email: v.email, confirm: v.confirm });
          }, function (e2) {
            if (e2.code === 'WEB_OFFER_NOT_FOUND') renderNoOffer(Prep.message(e2));
            else renderError(e2, init);
          });
          return;

        case 'IDEMPOTENCY_CONFLICT':
          Attempt.clear();
          formError(form, Prep.message(err));
          ensureAttempt().catch(function () {});
          return;

        case 'CHECKOUT_NOT_FOUND':
          // انتهت صلاحية المحاولة قبل الإرسال — نحجز غيرها ونعيد مرة واحدة
          Attempt.clear();
          if (!retried) { submit(form, true); return; }
          formError(form, Prep.message(err));
          return;

        case 'WEB_OFFER_NOT_FOUND':
          renderNoOffer(Prep.message(err));
          return;

        default:
          // شبكة أو خادم: المحاولة نفسها محفوظة، وإعادة الإرسال تعيد الطلب نفسه لا طلبًا ثانيًا
          formError(form, Prep.message(err));
      }
    });
  }

  /* ══════════════ متابعة الحالة (LP-05) ══════════════ */
  var poll = { timer: null, started: 0, mode: null };

  function stopPolling() { clearTimeout(poll.timer); poll.timer = null; }

  function track(s, mode) {
    stopPolling();
    poll.started = Date.now();
    poll.mode = mode;          // submit: بعد الإرسال مباشرة · resume: بعد العودة أو إعادة التحميل
    view = null;
    handle(s);
  }

  // «تحقّق مرة أخرى»: دورة قراءة جديدة بمهلتها كاملة
  function recheck() {
    stopPolling();
    poll.started = Date.now();
    poll.mode = 'resume';
    view = null;
    renderVerifying();
    tick();
  }

  function schedule() {
    var c = cfg.checkout;
    var elapsed = Date.now() - poll.started;
    if (elapsed > c.pollTimeoutMs) { renderTimeout(); return; }
    poll.timer = setTimeout(tick, elapsed > c.pollBackoffAfterMs ? c.pollBackoffIntervalMs : c.pollIntervalMs);
  }

  function tick() {
    var a = Attempt.get();
    if (!a) { renderNoSession(); return; }
    api.getAttemptStatus(a.attempt_id, a.checkout_token).then(handle, function (err) {
      if (err.code === 'CHECKOUT_NOT_FOUND') { Attempt.clear(); renderNoSession(); return; }
      if (err.code === 'RATE_LIMITED' && err.details.retry_after) {
        poll.timer = setTimeout(tick, err.details.retry_after * 1000);
        return;
      }
      // خطأ مؤقت: نستمر حتى المهلة ثم نعرض «قيد المعالجة» لا «فشل»
      schedule();
    });
  }

  function handle(s) {
    status = s;
    if (s.offer) offer = s.offer;
    renderSummary();

    if (TERMINAL[s.status]) {
      stopPolling();
      Attempt.update({ final: s.status });
      if (s.status === 'confirmed') renderConfirmed(s);
      else if (s.status === 'contact_support') renderContactSupport(s);
      else if (s.status === 'refunded') renderRefunded(s);
      else renderUnavailable(s);
      return;
    }

    if (s.status === 'payment_required') {
      if (poll.mode === 'submit') { redirect(s); return; }
      // بعد العودة: قد يتأخر إشعار ميسّر ثوانٍ — ننتظر قبل أن نقترح إكمال الدفع
      if (Date.now() - poll.started < RESUME_GRACE_MS) renderVerifying();
      else renderAwaitingPayment(s);
    } else {
      poll.mode === 'submit' ? renderPreparing() : renderVerifying();
    }
    schedule();
  }

  function safeCheckoutUrl(s) {
    return s && typeof s.checkout_url === 'string' && /^https:\/\//.test(s.checkout_url) ? s.checkout_url : null;
  }

  function redirect(s) {
    var url = safeCheckoutUrl(s);
    if (!url) { poll.mode = 'resume'; renderAwaitingPayment(s); schedule(); return; }
    setStep('pay');
    render('redirect',
      '<div class="state state--wait">' +
        '<span class="bubble bubble--wait" aria-hidden="true"></span>' +
        '<h1 class="panel__h">ننقلك إلى صفحة الدفع…</h1>' +
        '<p class="panel__lead">صفحة ميسّر الآمنة. بعد الدفع تعود تلقائيًا إلى هذه الصفحة لنؤكد طلبك.</p>' +
      '</div>' +
      '<div class="acts"><a class="btn btn--outline" href="' + esc(url) + '" rel="noopener">إن لم تنتقل تلقائيًا، افتح صفحة الدفع</a></div>'
    );
    location.assign(url);
  }

  function renderPreparing() {
    if (view === 'preparing') return;
    setStep('pay');
    render('preparing',
      '<div class="state state--wait">' +
        '<span class="bubble bubble--wait" aria-hidden="true"></span>' +
        '<h1 class="panel__h">نجهّز صفحة الدفع…</h1>' +
        '<p class="panel__lead">لحظات وننقلك إلى صفحة ميسّر. لا تغلق هذه الصفحة.</p>' +
      '</div>'
    );
  }

  function renderVerifying() {
    if (view === 'verifying') return;
    setStep('done');
    render('verifying',
      '<div class="state state--wait">' +
        '<span class="bubble bubble--wait" aria-hidden="true"></span>' +
        '<h1 class="panel__h">نتأكد من عملية الدفع…</h1>' +
        '<p class="panel__lead">ننتظر تأكيد ميسّر، ويستغرق ذلك عادةً ثوانٍ. لا تكرر الدفع.</p>' +
      '</div>'
    );
  }

  function renderAwaitingPayment(s) {
    if (view === 'awaiting') return;
    var url = safeCheckoutUrl(s);
    setStep('pay');
    render('awaiting',
      '<div class="state state--wait">' +
        '<span class="bubble bubble--pending" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 2"/></svg></span>' +
        '<h1 class="panel__h">لم يصلنا تأكيد الدفع بعد</h1>' +
        '<p class="panel__lead">إن لم تُكمل الدفع في صفحة ميسّر فأكمله الآن. <b>وإن كنت دفعت فلا تدفع مرة أخرى</b> — التأكيد يصل عادةً خلال دقيقة، وهذه الصفحة تتحدث وحدها.</p>' +
      '</div>' +
      '<div class="acts">' +
        (url ? '<a class="btn btn--gold" href="' + esc(url) + '" rel="noopener">أكمل الدفع في صفحة ميسّر</a>' : '') +
        '<button class="btn btn--outline" type="button" data-act="again">تحقّق مرة أخرى</button>' +
      '</div>' +
      referenceHtml(s)
    );
    on('[data-act=again]', recheck);
  }

  function renderTimeout() {
    stopPolling();
    setStep('done');
    render('timeout',
      '<div class="state state--wait">' +
        '<span class="bubble bubble--pending" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 2"/></svg></span>' +
        '<h1 class="panel__h">ما زال طلبك قيد المعالجة</h1>' +
        '<p class="panel__lead">لم يصلنا تأكيد نهائي بعد، والتحقق مستمر من جهتنا. <b>لا تكرر الدفع</b> — يصلك بريد عند اكتمال الطلب، وتجد الدورة في التطبيق.</p>' +
      '</div>' +
      '<div class="acts">' +
        '<button class="btn btn--gold" type="button" data-act="again">تحقّق مرة أخرى</button>' +
        (safeCheckoutUrl(status) ? '<a class="btn btn--outline" href="' + esc(status.checkout_url) + '" rel="noopener">لم أكمل الدفع — افتح صفحة ميسّر</a>' : '') +
      '</div>' +
      referenceHtml(status)
    );
    on('[data-act=again]', recheck);
  }

  /* ── النتائج النهائية ── */
  function renderConfirmed(s) {
    setStep('done', true);
    var a = Attempt.get() || {};
    var who = a.email
      ? 'على حساب PREP المسجّل بالبريد <bdi dir="ltr" class="em">' + esc(a.email) + '</bdi>'
      : 'على حساب PREP الذي كتبت بريده';

    render('confirmed',
      '<div class="state state--done">' +
        '<span class="bubble bubble--done" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 12.5 4 4 8-9"/></svg></span>' +
        '<h1 class="panel__h">تم الدفع — مشترياتك مفعّلة</h1>' +
        '<p class="panel__lead">فعّلنا <b>' + esc(offer ? offer.name : 'مشترياتك') + '</b> ' + who + '.</p>' +
      '</div>' +

      '<ol class="next">' +
        '<li><h2>افتح تطبيق PREP</h2>' + Prep.storeButtons() + '</li>' +
        '<li><h2>ادخل بالحساب نفسه</h2>' +
          '<p>' + (a.email ? 'البريد <bdi dir="ltr">' + esc(a.email) + '</bdi> وكلمة المرور الخاصة بحسابك.' : 'البريد الذي كتبته عند الشراء وكلمة المرور الخاصة بحسابك.') + '</p></li>' +
        '<li><h2>ابدأ التعلّم</h2>' +
          '<p>تجد ' + esc(offer ? offer.name : 'ما اشتريته') + ' في «دوراتي» — ' + esc(Prep.accessSentence(offer)) + '.</p></li>' +
      '</ol>' +

      '<div class="receipt">' +
        (s.support_reference ? '<p>رقم المرجع <bdi dir="ltr">' + esc(s.support_reference) + '</bdi></p>' : '') +
        '<p class="muted">يصلك إيصال الشراء على بريدك.</p>' +
      '</div>' +

      '<div class="acts">' +
        '<a class="btn btn--gold" href="index.html">العودة إلى الموقع</a>' +
        '<button class="btn btn--outline" type="button" data-act="another">اشترِ دورة أخرى</button>' +
      '</div>'
    );
    on('[data-act=another]', startOver);
  }

  function renderUnavailable(s) {
    setStep('pay');
    render('unavailable',
      '<div class="state state--fail">' +
        '<span class="bubble bubble--fail" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 8l8 8M16 8l-8 8"/></svg></span>' +
        '<h1 class="panel__h">لم يكتمل الدفع</h1>' +
        '<p class="panel__lead">رُفضت عملية الدفع أو انتهت مهلة صفحة الدفع، ولم يُفعَّل الوصول. تستطيع المحاولة مرة أخرى بطلب جديد.</p>' +
      '</div>' +
      '<div class="acts">' +
        '<button class="btn btn--gold" type="button" data-act="retry">حاول الشراء مرة أخرى</button>' +
        '<a class="btn btn--outline" href="index.html#plans">اختر دورة أخرى</a>' +
      '</div>' +
      '<p class="help">تكرر الرفض؟ ' + supportHtml(s) + (s.support_reference ? ' واذكر رقم المرجع <bdi dir="ltr">' + esc(s.support_reference) + '</bdi>' : '') + '.</p>'
    );
    on('[data-act=retry]', function () { startOver(offer && offer.offer_id); });
  }

  function renderContactSupport(s) {
    setStep('done');
    render('contact-support',
      '<div class="state state--wait">' +
        '<span class="bubble bubble--pending" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 2"/></svg></span>' +
        '<h1 class="panel__h">وصلنا دفعك — والتفعيل يحتاج مراجعة</h1>' +
        '<p class="panel__lead">استلمنا المبلغ، لكن تفعيل الوصول يحتاج مراجعة من فريق الدعم. <b>لا تدفع مرة أخرى.</b></p>' +
        '<p class="muted">تواصل مع الدعم: ' + supportHtml(s) + '</p>' +
      '</div>' +
      referenceHtml(s)
    );
  }

  function renderRefunded(s) {
    setStep('done', true);
    render('refunded',
      '<div class="state">' +
        '<span class="bubble bubble--pending" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg></span>' +
        '<h1 class="panel__h">استُرد مبلغ هذا الطلب</h1>' +
        '<p class="panel__lead">أُعيد المبلغ إلى وسيلة الدفع الأصلية، وأُلغي الوصول المرتبط بهذا الشراء.</p>' +
        '<p class="muted">لأي استفسار: ' + supportHtml(s) + '</p>' +
      '</div>' +
      referenceHtml(s) +
      '<div class="acts"><a class="btn btn--outline" href="index.html#plans">العودة إلى الباقات</a></div>'
    );
  }

  function startOver(offerId) {
    stopPolling();
    Attempt.clear();
    status = null;
    if (typeof offerId === 'string') { setQuery(offerId); loadOffer(offerId); }
    else location.href = 'index.html#plans';
  }

  /* ══════════════ البدء ══════════════ */
  function loadOffer(offerId) {
    setStep('details');
    loading('جارٍ تحميل تفاصيل العرض…');
    api.getOffer(offerId).then(function (o) {
      offer = o;
      renderForm();
    }, function (err) {
      if (err.code === 'WEB_OFFER_NOT_FOUND' || err.status === 404 || err.status === 422) renderNoOffer(Prep.message({ code: 'WEB_OFFER_NOT_FOUND' }));
      else renderError(err, function () { loadOffer(offerId); });
    });
  }

  function init() {
    var offerId = params.get('offer');
    var hasOtherParams = Array.from(params.keys()).some(function (k) { return k !== 'offer'; });
    var saved = Attempt.get();

    if (saved && saved.submitted) {
      loading('نقرأ حالة طلبك…');
      api.getAttemptStatus(saved.attempt_id, saved.checkout_token).then(function (s) {
        // جاء من زر شراء بعد انتهاء الطلب السابق → ابدأ شراءً جديدًا
        if (offerId && TERMINAL[s.status]) { Attempt.clear(); setQuery(offerId); loadOffer(offerId); return; }
        setQuery(null);
        track(s, 'resume');
      }, function (err) {
        if (err.code === 'CHECKOUT_NOT_FOUND') {
          Attempt.clear();
          if (offerId && !hasOtherParams) loadOffer(offerId); else renderNoSession();
          return;
        }
        renderError(err, init);
      });
      return;
    }

    if (hasOtherParams && !offerId) { setQuery(null); renderNoSession(); return; }
    if (!offerId) { renderNoOffer(); return; }
    if (hasOtherParams) setQuery(offerId);
    loadOffer(offerId);
  }

  init();
})();
