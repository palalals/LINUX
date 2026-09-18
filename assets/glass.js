/* LINUX — Liquid Glass interaction layer
   specular highlight · magnetic buttons · header morph · hero parallax &
   pause · scroll reveal · mega menu keyboard support. Respects reduced motion. */
(function () {
  'use strict';
  const doc = document;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;
  /* Hover-swap card images are only fetched on pointer devices (they never show on touch) */
  if (fine) doc.querySelectorAll('img[data-hover-only][data-src]').forEach((img) => { img.src = img.dataset.src; });
  else doc.querySelectorAll('img[data-hover-only]').forEach((img) => img.remove());

  /* Specular sheen follows the pointer on [data-specular] glass */
  if (fine && !reduce) {
    doc.addEventListener('pointermove', (e) => {
      const el = e.target.closest && e.target.closest('[data-specular]');
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      el.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    }, { passive: true });
  }

  /* Magnetic pull on primary CTAs */
  if (fine && !reduce) {
    doc.addEventListener('pointermove', (e) => {
      const btn = e.target.closest && e.target.closest('[data-magnetic]');
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) * 0.22;
      const y = (e.clientY - (r.top + r.height / 2)) * 0.22;
      btn.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }, { passive: true });
    doc.addEventListener('pointerout', (e) => {
      const btn = e.target.closest && e.target.closest('[data-magnetic]');
      if (btn && !btn.contains(e.relatedTarget)) btn.style.transform = '';
    });
  }

  /* Header: compact capsule on scroll, hide on scroll-down past the fold */
  const header = doc.querySelector('[data-header]');
  let lastY = window.scrollY, ticking = false;
  function onScroll() {
    const y = window.scrollY;
    if (header) {
      header.classList.toggle('is-compact', y > 48);
      // Hide when scrolling down (after a small threshold), reveal immediately on scroll up
      const goingDown = y > lastY + 2, goingUp = y < lastY - 2;
      if (goingDown && y > 140 && !doc.body.classList.contains('drawer-open')) header.classList.add('is-hidden');
      else if (goingUp || y <= 140) header.classList.remove('is-hidden');
      const zone = header.closest('[data-header-zone]');
      zone && zone.classList.toggle('is-scrolled', y > 40);
    }
    lastY = y; ticking = false;
  }
  addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(onScroll); ticking = true; } }, { passive: true });
  onScroll();

  /* Hero video pause/play + Save-Data respect */
  const video = doc.querySelector('[data-hero-video]');
  if (video) {
    const saveData = navigator.connection && navigator.connection.saveData;
    if (saveData) { video.pause(); video.removeAttribute('autoplay'); }
    else { video.play().catch(() => {}); }
    // Free the decoder when the hero is off-screen
    if ('IntersectionObserver' in window && !saveData) {
      new IntersectionObserver((entries) => entries.forEach((en) => {
        if (en.isIntersecting) video.play().catch(() => {}); else video.pause();
      }), { threshold: 0.05 }).observe(video);
    }
  }

  /* Scroll reveal */
  const revealables = doc.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    revealables.forEach((el) => io.observe(el));
    // Re-observe elements injected later (rails, search results)
    new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach((n) => {
      if (n.nodeType !== 1) return;
      if (n.matches && n.matches('[data-reveal]') && !n.classList.contains('is-in')) io.observe(n);
      n.querySelectorAll && n.querySelectorAll('[data-reveal]:not(.is-in)').forEach((el) => io.observe(el));
    }))).observe(doc.body, { childList: true, subtree: true });
  } else {
    revealables.forEach((el) => el.classList.add('is-in'));
  }

  /* Split headlines into words so they can rise one by one */
  doc.querySelectorAll('[data-split]').forEach((el) => {
    if (el.dataset.splitDone) return;
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    words.forEach((w, i) => {
      const outer = doc.createElement('span'); outer.className = 'w'; outer.style.setProperty('--w', i);
      const inner = doc.createElement('span'); inner.textContent = w;
      outer.appendChild(inner); el.appendChild(outer);
      if (i < words.length - 1) el.appendChild(doc.createTextNode(' '));
    });
    el.dataset.splitDone = '1';
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
  });

  /* Count-up numbers when they scroll into view: <strong data-count>4,000</strong> */
  if ('IntersectionObserver' in window && !reduce) {
    const cio = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      cio.unobserve(en.target);
      const el = en.target, raw = el.textContent.trim();
      const m = raw.match(/^([^\d]*)([\d,.]+)(.*)$/);
      if (!m) return;
      const target = parseFloat(m[2].replace(/,/g, ''));
      const decimals = (m[2].split('.')[1] || '').length;
      const useComma = m[2].includes(',');
      const t0 = performance.now(), dur = 1200;
      const fmt = (v) => { let s = v.toFixed(decimals); if (useComma) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); return m[1] + s + m[3]; };
      const tick = (t) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(target * e); if (p < 1) requestAnimationFrame(tick); else el.textContent = raw; };
      requestAnimationFrame(tick);
    }), { threshold: 0.4 });
    doc.querySelectorAll('[data-count]').forEach((el) => cio.observe(el));
  }

  /* 3D tilt + glare on cards (pointer devices only) */
  if (fine && !reduce) {
    let tiltEl = null;
    doc.addEventListener('pointermove', (e) => {
      const el = e.target.closest && e.target.closest('[data-tilt]');
      if (tiltEl && tiltEl !== el) { tiltEl.classList.remove('is-tilting'); tiltEl.style.removeProperty('--rx'); tiltEl.style.removeProperty('--ry'); }
      tiltEl = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      el.classList.add('is-tilting');
      el.style.setProperty('--ry', ((px - .5) * 8).toFixed(2) + 'deg');
      el.style.setProperty('--rx', ((.5 - py) * 8).toFixed(2) + 'deg');
      el.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
      el.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
    }, { passive: true });
    doc.addEventListener('pointerleave', () => { if (tiltEl) { tiltEl.classList.remove('is-tilting'); tiltEl = null; } }, true);
    doc.addEventListener('pointerout', (e) => {
      const el = e.target.closest && e.target.closest('[data-tilt]');
      if (el && !el.contains(e.relatedTarget)) { el.classList.remove('is-tilting'); el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); if (tiltEl === el) tiltEl = null; }
    });
  }

  /* Elements with data-parallax drift at their own rate while the hero scrolls */
  const parallaxEls = doc.querySelectorAll('[data-parallax]');
  if (parallaxEls.length && !reduce) {
    addEventListener('scroll', () => {
      const y = window.scrollY; if (y > window.innerHeight * 1.2) return;
      parallaxEls.forEach((el) => { el.style.translate = `0 ${(y * parseFloat(el.dataset.parallax || '0.1')).toFixed(1)}px`; });
    }, { passive: true });
  }

  /* Intro curtain: removed once its exit animation ends (or immediately on repeat visits) */
  const curtain = doc.querySelector('.curtain');
  if (curtain) {
    const seen = sessionStorage.getItem('linux:curtain');
    if (seen || reduce) curtain.remove();
    else { sessionStorage.setItem('linux:curtain', '1'); curtain.addEventListener('animationend', (e) => { if (e.animationName === 'curtain-out') curtain.remove(); }); setTimeout(() => curtain.remove(), 2200); }
  }

  /* Mega menu: keyboard + touch open */
  doc.querySelectorAll('[data-mega]').forEach((item) => {
    const link = item.querySelector('.nav-link');
    link.addEventListener('click', (e) => {
      if (!fine || matchMedia('(hover: none)').matches) {
        if (!item.classList.contains('is-open')) { e.preventDefault(); doc.querySelectorAll('[data-mega].is-open').forEach((o) => o !== item && o.classList.remove('is-open')); item.classList.add('is-open'); link.setAttribute('aria-expanded', 'true'); }
      }
    });
    link.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); item.classList.add('is-open'); link.setAttribute('aria-expanded', 'true'); const first = item.querySelector('.mega a'); first && first.focus(); } });
    item.addEventListener('keydown', (e) => { if (e.key === 'Escape') { item.classList.remove('is-open'); link.setAttribute('aria-expanded', 'false'); link.focus(); } });
    item.addEventListener('focusout', (e) => { if (!item.contains(e.relatedTarget)) { item.classList.remove('is-open'); link.setAttribute('aria-expanded', 'false'); } });
  });
  doc.addEventListener('click', (e) => { if (!e.target.closest('[data-mega]')) doc.querySelectorAll('[data-mega].is-open').forEach((o) => { o.classList.remove('is-open'); o.querySelector('.nav-link').setAttribute('aria-expanded', 'false'); }); });

  /* Rails: prev/next buttons */
  doc.querySelectorAll('[data-rail]').forEach((rail) => {
    const track = rail.querySelector('.rail__track');
    const prev = rail.querySelector('[data-rail-prev]');
    const next = rail.querySelector('[data-rail-next]');
    if (!track) return;
    const dir = getComputedStyle(track).direction === 'rtl' ? -1 : 1;
    const step = () => { const first = track.firstElementChild; return first ? first.getBoundingClientRect().width + 20 : 300; };
    prev && prev.addEventListener('click', () => track.scrollBy({ left: -step() * dir, behavior: 'smooth' }));
    next && next.addEventListener('click', () => track.scrollBy({ left: step() * dir, behavior: 'smooth' }));
    const update = () => {
      const max = track.scrollWidth - track.clientWidth - 2;
      const pos = Math.abs(track.scrollLeft);
      if (prev) prev.disabled = pos <= 2;
      if (next) next.disabled = pos >= max;
    };
    track.addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    update();
  });

  /* Hotspots (shop the look) */
  doc.addEventListener('click', (e) => {
    const spot = e.target.closest('[data-hotspot]');
    const openCards = doc.querySelectorAll('.hotspot__card.is-open');
    if (!spot) { if (!e.target.closest('.hotspot__card')) openCards.forEach((c) => c.classList.remove('is-open')); return; }
    const card = spot.nextElementSibling;
    openCards.forEach((c) => c !== card && c.classList.remove('is-open'));
    card && card.classList.toggle('is-open');
  });

  /* Marquees only animate while on screen */
  if ('IntersectionObserver' in window) {
    const mio = new IntersectionObserver((entries) => entries.forEach((en) => { en.target.style.animationPlayState = en.isIntersecting ? '' : 'paused'; }), { threshold: 0 });
    doc.querySelectorAll('.marquee__track, .announcement__track').forEach((t) => mio.observe(t));
  }
  /* Announcement duplicates for seamless marquee are in Liquid; pause on hover */
  doc.querySelectorAll('.announcement').forEach((a) => {
    a.addEventListener('pointerenter', () => a.querySelector('.announcement__track').style.animationPlayState = 'paused');
    a.addEventListener('pointerleave', () => a.querySelector('.announcement__track').style.animationPlayState = '');
  });
})();
