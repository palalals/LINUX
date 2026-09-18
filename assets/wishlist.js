/* LINUX — wishlist (localStorage, no account needed) + saved view render */
(function () {
  'use strict';
  const L = window.LINUX;
  const S = L.settings || {};
  const root = S.root && S.root !== '/' ? S.root.replace(/\/$/, '') : '';
  const KEY = 'linux:wishlist';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
  const write = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {} paint(); L.emit('wishlist:updated', list); };

  function paint() {
    const list = read();
    document.querySelectorAll('[data-wishlist-toggle]').forEach((btn) => {
      const on = list.includes(btn.dataset.wishlistToggle);
      if (btn.classList.contains('is-active') !== on) btn.classList.toggle('is-active', on);
      if (btn.getAttribute('aria-pressed') !== String(on)) btn.setAttribute('aria-pressed', String(on));
    });
    // Only write when changed: this runs from a MutationObserver, and setting
    // textContent to the same value would still queue a mutation → loop.
    const n = String(list.length);
    document.querySelectorAll('[data-wishlist-count]').forEach((el) => {
      if (el.textContent !== n) el.textContent = n;
      if (el.hidden !== (list.length === 0)) el.hidden = list.length === 0;
    });
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-wishlist-toggle]');
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    const h = btn.dataset.wishlistToggle;
    const list = read();
    const i = list.indexOf(h);
    btn.classList.remove('is-popping'); void btn.offsetWidth; btn.classList.add('is-popping');
    if (i > -1) { list.splice(i, 1); L.toast(L.strings.removed, { type: 'success' }); }
    else { list.unshift(h); L.buzz(); L.toast(L.strings.saved, { action: { label: L.strings.view_bag.replace(/bag|الشنطة|الحقيبة/i, '♥'), href: `${root}/search?view=wishlist` } }); }
    write(list);
  });

  // Saved page (/search?view=wishlist) renders cards from product JSON
  const grid = document.querySelector('[data-wishlist-grid]');
  if (grid) {
    const empty = document.querySelector('[data-wishlist-empty]');
    const render = async () => {
      const list = read();
      grid.innerHTML = '';
      if (!list.length) { empty && (empty.hidden = false); return; }
      empty && (empty.hidden = true);
      const cards = await Promise.all(list.map(async (h) => {
        try {
          const res = await fetch(`${root}/products/${h}?section_id=wishlist-card`);
          if (res.ok) { const html = await res.text(); if (html.includes('data-product-card')) return html; }
        } catch {}
        try {
          const p = await L.fetchJSON(`${root}/products/${h}.js`);
          const img = p.featured_image ? (p.featured_image.includes('cdn.shopify.com') ? p.featured_image.replace(/(\.[a-z]+)(\?|$)/, '_720x$1$2') : p.featured_image) : '';
          const v = p.variants.find((x) => x.available) || p.variants[0];
          return `<article class="card glass glass--hover" data-product-card data-handle="${p.handle}"><div class="card__media"><a href="${p.url}"><img class="card__img--main" src="${img}" alt="${L.title(p.title)}" width="720" height="960" loading="lazy"></a><button class="card__wish is-active" type="button" data-wishlist-toggle="${p.handle}" aria-pressed="true"><svg class="icon icon--heart-fill" width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/></svg></button>${p.has_only_default_variant || p.variants.length === 1 ? `<div class="card__quick glass glass--solid"><button class="btn btn--cream btn--sm btn--block" type="button" data-quick-add="${v.id}">+ ${L.strings.add_to_bag}</button></div>` : ''}</div><div class="card__body"><h3 class="card__title"><a href="${p.url}">${L.title(p.title)}</a></h3><p class="card__meta">${p.type || ''}</p><div class="card__price"><span class="price"><span class="price__current">${L.money(p.price)}</span></span></div></div></article>`;
        } catch { return ''; }
      }));
      grid.innerHTML = cards.join('');
      paint();
    };
    render();
    L.on('wishlist:updated', render);
  }

  paint();
  // Paint hearts on cards injected later (rails, search, quick view) — react to
  // added nodes only, never to attribute/text changes paint() itself makes.
  new MutationObserver((muts) => {
    if (muts.some((m) => m.addedNodes.length)) paint();
  }).observe(document.body, { childList: true, subtree: true });
  L.wishlist = { read, write };
})();
