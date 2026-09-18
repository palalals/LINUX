/* LINUX — global utilities: event bus, fetch, money, focus trap, toast */
(function () {
  'use strict';
  const L = (window.LINUX = window.LINUX || {});
  const S = L.settings || {};

  const listeners = new Map();
  L.on = (ev, fn) => { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev).add(fn); return () => listeners.get(ev).delete(fn); };
  L.emit = (ev, data) => { (listeners.get(ev) || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); };

  /* Word-level Arabic fallback for client-rendered product titles (mirrors snippets/product-title.liquid) */
  L.title = (title) => {
    if (!L.words || /[\u0600-\u06FF]/.test(title)) return title;
    return String(title).split(' ').map((w) => L.words[w.toLowerCase()] || w).join(' ');
  };
  L.money = function (cents) {
    if (cents == null || isNaN(cents)) return '';
    const n = Number(cents) / 100;
    const two = n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    // Arabic: "649 جنيه" (mirrors snippets/money.liquid); other locales: the shop's money format
    if (S.locale === 'ar') return two.replace(/\.00$/, '') + ' ' + (S.currencyAr || 'جنيه');
    const fmt = S.moneyFormat || 'LE {{amount}}';
    return fmt
      .replace(/{{\s*amount_no_decimals\s*}}/g, Math.round(n).toLocaleString('en-US'))
      .replace(/{{\s*amount_no_trailing_zeros\s*}}/g, two.replace(/\.00$/, ''))
      .replace(/{{\s*amount_with_comma_separator\s*}}/g, n.toFixed(2).replace('.', ','))
      .replace(/{{\s*amount\s*}}/g, two)
      .replace(/<[^>]+>/g, '');
  };

  L.fetchJSON = async function (url, opts = {}) {
    const res = await fetch(url, { credentials: 'same-origin', ...opts, headers: { Accept: 'application/json', ...(opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) } });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) { const err = new Error((data && (data.description || data.message)) || res.statusText || 'Request failed'); err.status = res.status; err.body = data; throw err; }
    return data;
  };

  L.debounce = (fn, wait = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); }; };

  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  L.trapFocus = function (container) {
    if (!container) return () => {};
    const items = () => Array.from(container.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const list = items(); if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    container.addEventListener('keydown', onKey);
    const first = items().find((el) => !el.hasAttribute('data-drawer-close')) || items()[0];
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 30);
    return () => container.removeEventListener('keydown', onKey);
  };

  L.toast = function (message, { type = 'success', image, action, duration = 3600 } = {}) {
    const stack = document.querySelector('.toast-stack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = `toast glass glass--solid toast--${type}`;
    el.setAttribute('role', 'status');
    const icon = type === 'error'
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>';
    el.innerHTML = `${image ? `<img class="toast__img" src="${image}" alt="">` : `<span class="toast__icon">${icon}</span>`}<span class="toast__msg">${message}</span>${action ? `<a class="toast__action" href="${action.href || '#'}" data-toast-action>${action.label}</a>` : ''}`;
    if (action && action.onClick) el.querySelector('[data-toast-action]').addEventListener('click', (e) => { e.preventDefault(); action.onClick(); });
    stack.appendChild(el);
    while (stack.children.length > 3) stack.firstChild.remove();
    const kill = () => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 400); };
    const t = setTimeout(kill, duration);
    el.addEventListener('click', () => { clearTimeout(t); kill(); });
    return el;
  };

  // Haptic-ish feedback on supported devices for primary actions
  L.buzz = (ms = 8) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch {} };

  // Shopify Section Rendering helper
  L.renderSection = async function (sectionId, url = window.location.pathname) {
    const u = new URL(url, window.location.origin);
    u.searchParams.set('section_id', sectionId);
    const res = await fetch(u.toString(), { credentials: 'same-origin' });
    if (!res.ok) throw new Error('section render failed');
    const html = await res.text();
    const tpl = document.createElement('div');
    tpl.innerHTML = html;
    return tpl;
  };

  // Copy-to-clipboard for share buttons
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    try {
      if (navigator.share && btn.dataset.share !== undefined) { await navigator.share({ title: document.title, url: btn.dataset.copy }); return; }
      await navigator.clipboard.writeText(btn.dataset.copy);
      L.toast(L.strings.copied);
    } catch {}
  });
})();
