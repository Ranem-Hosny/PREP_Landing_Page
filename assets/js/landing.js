/* ══════════════════════════════════════════════
   PREP — بطاقات الدورات والباقات من العروض المنشورة (LP-01 / LP-02)
   GET /public/web-offers هو المصدر الوحيد للأسعار والمدد — لا سعر ثابت في HTML.
   الدورات تُجمع في بطاقة «الدورة المفردة» بقائمة اختيار، ولكل باقة بطاقتها.
   ══════════════════════════════════════════════ */
(function () {
  'use strict';

  var api = window.PrepAPI;
  var Prep = window.Prep;
  var root = document.getElementById('offers');
  if (!api || !Prep || !root) return;
  var esc = Prep.esc;

  function checkoutUrl(offerId) { return 'checkout.html?offer=' + encodeURIComponent(offerId); }

  // شريط علوي مضغوط بنسيج ورقة الإجابات — بديل اللوحة الكبيرة
  function band(offer) {
    return '<div class="rate__band" aria-hidden="true"><span class="rate__chip">' + Prep.kindLabel(offer) + '</span></div>';
  }

  function priceHtml(offer, prefix) {
    return (prefix ? '<span>' + prefix + '</span>' : '') +
      '<b>' + Prep.money(offer.total.amount) + '</b>' +
      '<span>' + Prep.currency(offer.total) + ' · ' + esc(Prep.accessLabel(offer)) + '</span>';
  }

  // المزايا من بيانات العرض نفسها فقط — لا ادعاء لا يعرفه الباك إند
  function factsHtml(offer) {
    var li = [];
    if (offer.item_type === 'package' && offer.courses && offer.courses.length) {
      offer.courses.slice(0, 4).forEach(function (c) { li.push(esc(c.name)); });
      if (offer.courses.length > 4) li.push('و' + (offer.courses.length - 4) + ' دورات أخرى');
    }
    li.push(esc(Prep.accessSentence(offer)));
    li.push('دفعة واحدة — بدون تجديد تلقائي');
    li.push(esc(Prep.taxLabel(offer)));
    return li.map(function (x) { return '<li>' + x + '</li>'; }).join('');
  }

  /* ── بطاقة باقة ── */
  function packageCard(offer, featured) {
    return '<article class="rate__row' + (featured ? ' rate__row--pick' : '') + '">' +
      band(offer) +
      '<div class="rate__head">' +
        '<h3 class="rate__n">' + esc(offer.name) + '</h3>' +
        (offer.description ? '<p class="rate__d">' + esc(offer.description) + '</p>' : '') +
      '</div>' +
      '<p class="rate__p">' + priceHtml(offer) + '</p>' +
      '<ul class="rate__f">' + factsHtml(offer) + '</ul>' +
      '<a class="btn ' + (featured ? 'btn--gold' : 'btn--outline') + ' btn--full" href="' + checkoutUrl(offer.offer_id) + '">اشترِ هذه الباقة</a>' +
    '</article>';
  }

  /* ── بطاقة الدورة المفردة ── */
  function courseCard(courses) {
    var single = courses.length === 1 ? courses[0] : null;
    var min = courses.reduce(function (a, c) { return c.total.amount < a.total.amount ? c : a; });
    var allSame = courses.every(function (c) { return c.total.amount === min.total.amount; });

    return '<article class="rate__row" data-course-card>' +
      band(single || min) +
      '<div class="rate__head">' +
      '<h3 class="rate__n">' + (single ? esc(single.name) : 'الدورة المفردة') + '</h3>' +
      '<p class="rate__d" data-desc>' + esc(single ? (single.description || 'تناسبك إذا كنت تحضّر لاختبار واحد فقط.') : 'تناسبك إذا كنت تحضّر لاختبار واحد فقط.') + '</p>' +
      (single ? '' :
        '<div class="pick">' +
          '<label class="pick__l" for="coursePick">اختر الدورة</label>' +
          '<select id="coursePick" aria-describedby="coursePickErr">' +
            '<option value="">اختر من القائمة</option>' +
            courses.map(function (c) { return '<option value="' + esc(c.offer_id) + '">' + esc(c.name) + '</option>'; }).join('') +
          '</select>' +
          '<p class="pick__err" id="coursePickErr" role="alert" hidden>اختر الدورة من القائمة أولًا.</p>' +
        '</div>') +
      '</div>' +
      '<p class="rate__p" data-price>' + priceHtml(single || min, single || allSame ? '' : 'يبدأ من') + '</p>' +
      '<ul class="rate__f" data-facts>' + factsHtml(single || min) + '</ul>' +
      '<a class="btn btn--outline btn--full" data-buy href="' + (single ? checkoutUrl(single.offer_id) : '#coursePick') + '">اشترِ هذه الدورة</a>' +
    '</article>';
  }

  function wireCoursePicker(courses) {
    var card = root.querySelector('[data-course-card]');
    var select = card && card.querySelector('select');
    if (!select) return;
    var err = card.querySelector('.pick__err');
    var btn = card.querySelector('[data-buy]');
    var byId = {};
    courses.forEach(function (c) { byId[c.offer_id] = c; });

    select.addEventListener('change', function () {
      var c = byId[select.value];
      err.hidden = true;
      select.removeAttribute('aria-invalid');
      if (!c) { btn.setAttribute('href', '#coursePick'); return; }
      card.querySelector('[data-desc]').textContent = c.description || 'تناسبك إذا كنت تحضّر لاختبار واحد فقط.';
      card.querySelector('[data-price]').innerHTML = priceHtml(c);
      card.querySelector('[data-facts]').innerHTML = factsHtml(c);
      btn.setAttribute('href', checkoutUrl(c.offer_id));
    });

    btn.addEventListener('click', function (e) {
      if (select.value) return;
      e.preventDefault();
      err.hidden = false;
      select.setAttribute('aria-invalid', 'true');
      select.focus();
    });
  }

  /* ── الحالات ── */
  function state(html) {
    root.className = 'rate';
    root.innerHTML = '<div class="rate__state">' + html + '</div>';
  }

  function load() {
    root.setAttribute('aria-busy', 'true');
    state('<span class="spin" aria-hidden="true"></span>جارٍ تحميل الدورات والباقات…');

    api.listOffers().then(function (offers) {
      root.removeAttribute('aria-busy');
      var courses = offers.filter(function (o) { return o.item_type === 'course'; });
      var packages = offers.filter(function (o) { return o.item_type === 'package'; });

      if (!offers.length) {
        state('<p>لا توجد دورات أو باقات متاحة للشراء من الموقع حاليًا.</p>');
        return;
      }

      // الباقة المميّزة = التي تجمع أكثر عدد من الدورات (حقيقة من البيانات، لا ادعاء)
      var featured = packages.reduce(function (a, p) {
        return !a || (p.courses || []).length > (a.courses || []).length ? p : a;
      }, null);

      var cards = [];
      if (courses.length) cards.push(courseCard(courses));
      packages.forEach(function (p) { cards.push(packageCard(p, packages.length > 1 && p === featured)); });

      root.className = 'rate rate--n' + Math.min(cards.length, 3);
      root.innerHTML = cards.join('');
      wireCoursePicker(courses);
    }, function (err) {
      root.removeAttribute('aria-busy');
      state('<p>' + esc(Prep.message(err)) + '</p>' +
        '<button class="btn btn--outline btn--sm" type="button" data-act="reload">حاول مرة أخرى</button>');
      root.querySelector('[data-act=reload]').addEventListener('click', load);
    });
  }

  load();
})();
