/* ══════════════════════════════════════════════
   PREP — مشترياتي (LP-07)
   صفحة إرشاد: الباك إند لا يوفّر سجل مشتريات على الموقع (CN-001).
   ══════════════════════════════════════════════ */
(function () {
  'use strict';

  var api = window.PrepAPI;
  var Prep = window.Prep;

  var stores = document.getElementById('stores');
  if (stores) stores.innerHTML = Prep.storeButtons();

  // طلب أُرسل في هذا التبويب ولم يصل إلى نتيجة نهائية — نوجّه إلى حالته قبل أي شراء جديد
  var a = api && api.Attempt.get();
  if (a && a.submitted && !a.final) {
    var box = document.getElementById('savedOrder');
    if (box) box.hidden = false;
  }
})();
