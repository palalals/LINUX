/* LINUX — drawers & modals: open/close, backdrop, focus trap, ESC, inert */
(function () {
  'use strict';
  const L = window.LINUX;
  let backdrop = document.querySelector('.backdrop');
  if (!backdrop) { backdrop = document.createElement('div'); backdrop.className = 'backdrop'; document.body.appendChild(backdrop); }
  let active = null, release = null, opener = null;

  function panel(name) { return document.querySelector(`[data-drawer="${name}"], [data-modal="${name}"]`); }

  function open(name, trigger) {
    const el = panel(name);
    if (!el) return;
    if (active && active !== el) close(false);
    active = el; opener = trigger || document.activeElement;
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    el.removeAttribute('inert');
    backdrop.classList.add('is-open');
    document.body.classList.add('drawer-open');
    document.querySelectorAll(`[data-drawer-open="${name}"]`).forEach((b) => b.setAttribute('aria-expanded', 'true'));
    release = L.trapFocus(el);
    L.emit('drawer:open', { name, el });
    if (name === 'search') { const i = el.querySelector('[data-search-input]'); i && setTimeout(() => i.focus(), 60); }
  }

  function close(restore = true) {
    if (!active) return;
    const el = active;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('inert', '');
    backdrop.classList.remove('is-open');
    document.body.classList.remove('drawer-open');
    document.querySelectorAll('[data-drawer-open][aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    if (release) release();
    L.emit('drawer:close', { name: el.dataset.drawer || el.dataset.modal, el });
    active = null;
    if (restore && opener && opener.focus) opener.focus({ preventScroll: true });
  }

  document.addEventListener('click', (e) => {
    const o = e.target.closest('[data-drawer-open]');
    if (o) { e.preventDefault(); open(o.dataset.drawerOpen, o); return; }
    if (e.target.closest('[data-drawer-close], [data-modal-close]')) { e.preventDefault(); close(); return; }
    if (e.target === backdrop) close();
    // Clicking inside a modal but outside its panel closes it
    if (active && active.dataset.modal && e.target === active) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && active) close(); });

  L.drawers = { open, close, get active() { return active; } };
})();
