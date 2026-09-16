/* ══════════════════════════════════════════════
   PREP — Landing Page
   ══════════════════════════════════════════════ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 1. Sticky nav ───────────────────────── */
  var nav = document.getElementById('nav');
  function onScroll() {
    nav.classList.toggle('is-stuck', window.scrollY > 24);
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ── 2. Mobile menu ──────────────────────── */
  var burger = document.getElementById('navBurger');
  var links = document.getElementById('navLinks');

  function closeMenu() {
    links.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'فتح القائمة');
  }

  burger.addEventListener('click', function () {
    var open = links.classList.toggle('is-open');
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
  });

  links.addEventListener('click', function (e) {
    if (e.target.closest('a')) closeMenu();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && links.classList.contains('is-open')) {
      closeMenu();
      burger.focus();
    }
  });

  document.addEventListener('click', function (e) {
    if (!links.classList.contains('is-open')) return;
    if (!e.target.closest('#navLinks') && !e.target.closest('#navBurger')) closeMenu();
  });

  /* ── 3. Content-type tabs (AI section) ───── */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));

  function selectTab(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.classList.toggle('is-on', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      var pane = document.getElementById(t.getAttribute('aria-controls'));
      if (pane) pane.hidden = !on;
    });
    if (focus) tab.focus();
  }

  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () { selectTab(tab); });

    // Roving focus. In RTL the arrow keys are mirrored: ArrowLeft moves forward.
    tab.addEventListener('keydown', function (e) {
      var next = null;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') next = tabs[0];
      else if (e.key === 'End') next = tabs[tabs.length - 1];
      if (next) { e.preventDefault(); selectTab(next, true); }
    });
  });

  /* ── 4. Reveal on scroll ─────────────────── */
  var revealTargets = document.querySelectorAll(
    '.shead, .flow__i, .faq__i, .faq__ask, ' +
    '.pay, .tab, .ai__view, .stores, .cta__h, .cta__l, .cta__acts'
  );

  if (!reduced && 'IntersectionObserver' in window) {
    Array.prototype.forEach.call(revealTargets, function (el, i) {
      el.classList.add('reveal');
      el.style.transitionDelay = (i % 4) * 70 + 'ms';
    });

    var revealer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        revealer.unobserve(entry.target);
      });
    }, { threshold: 0, rootMargin: '0px 0px -60px 0px' });

    Array.prototype.forEach.call(revealTargets, function (el) { revealer.observe(el); });

    // Safety net: nothing on a marketing page may stay invisible because an
    // observer missed it (very tall viewports, print, restored scroll).
    window.addEventListener('load', function () {
      Array.prototype.forEach.call(revealTargets, function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('is-in');
      });
    });
  }

  /* ── 5. Score ring + progress bars in view ─ */
  var ring = document.getElementById('ring');

  function fillBars(root) {
    root.querySelectorAll('.bar > i, .audio__bar > i').forEach(function (bar) {
      var w = bar.style.getPropertyValue('--w');
      if (!w) return;
      bar.style.width = '0';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { bar.style.width = w; });
      });
    });
  }

  if ('IntersectionObserver' in window) {
    var stageObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        if (ring) ring.classList.add('is-in');
        fillBars(entry.target);
        stageObs.unobserve(entry.target);
      });
    }, { threshold: 0.35 });

    var stage = document.getElementById('stage');
    if (stage) stageObs.observe(stage);
  } else if (ring) {
    ring.classList.add('is-in');
  }

  /* ── 6. Pointer parallax on the phone cluster ─
     Subtle: the cluster is the page's signature, so it should
     respond to the reader, not perform for them. */
  var cluster = document.getElementById('cluster');
  var stageEl = document.getElementById('stage');

  if (cluster && stageEl && !reduced && window.matchMedia('(pointer:fine)').matches) {
    var raf = null;
    var tx = -10, ty = 4;

    stageEl.addEventListener('pointermove', function (e) {
      var r = stageEl.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;   // -0.5 … 0.5
      var py = (e.clientY - r.top) / r.height - 0.5;
      tx = -10 + px * 12;
      ty = 4 - py * 9;
      if (raf) return;
      raf = requestAnimationFrame(function () {
        cluster.style.setProperty('--ry', tx.toFixed(2) + 'deg');
        cluster.style.setProperty('--rx', ty.toFixed(2) + 'deg');
        raf = null;
      });
    });

    stageEl.addEventListener('pointerleave', function () {
      cluster.style.setProperty('--ry', '-10deg');
      cluster.style.setProperty('--rx', '4deg');
    });
  }

  /* ── 7. Footer year ──────────────────────── */
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
