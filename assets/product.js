/* LINUX — product page & quick view: variant resolution, gallery, sticky bar,
   lightbox, recommendations, recently viewed. Also powers the quick-view modal
   (the product page's configured markup, without its page-only components). */
(function () {
  'use strict';
  const L = window.LINUX;
  const S = L.settings || {};
  const root = S.root && S.root !== '/' ? S.root.replace(/\/$/, '') : '';
  const ar = (document.documentElement.lang || '').toLowerCase().startsWith('ar');
  const bundleText = ar ? {
    piece: 'القطعة', estimate: 'تقديري', subtotal: 'الإجمالي قبل الخصومات', savings: 'التوفير التقديري', total: 'الإجمالي التقديري',
    choose: 'اختر خيارات متاحة لكل قطعة.', stock: 'الكمية المطلوبة تتجاوز المخزون المتاح.', quantity: 'أدخل كمية صحيحة أكبر من صفر.',
    select: 'اختر', average: 'متوسط سعر القطعة التقديري', oneTime: 'عروض المجموعة متاحة للشراء مرة واحدة فقط.',
  } : {
    piece: 'Piece', estimate: 'Estimate', subtotal: 'Subtotal before discounts', savings: 'Estimated savings', total: 'Estimated total',
    choose: 'Choose available options for every piece.', stock: 'The requested quantity exceeds available stock.', quantity: 'Enter a positive whole-number quantity.',
    select: 'Choose', average: 'Estimated average per piece', oneTime: 'Bundle offers support one-time purchases only.',
  };

  /* ------------------------------------------------------------------ */
  /* Product controller — one per [data-product]                         */
  /* ------------------------------------------------------------------ */
  function initProduct(rootEl) {
    if (!rootEl || rootEl.dataset.ready) return;
    rootEl.dataset.ready = '1';
    const variants = JSON.parse(rootEl.querySelector('[data-variants]')?.textContent || '[]');
    const meta = JSON.parse(rootEl.querySelector('[data-product-json]')?.textContent || '{}');
    const form = rootEl.querySelector('[data-product-form]');
    const optionLabels = JSON.parse(rootEl.querySelector('[data-option-labels]')?.textContent || '{}');
    if (!form || !variants.length) return;
    if (rootEl.hasAttribute('data-customize')) return; // the studio owns its own variant/price logic
    const idInput = form.querySelector('[data-variant-id]');
    const atc = form.querySelector('[data-atc]');
    const atcText = form.querySelector('[data-atc-text]');
    const atcPrice = form.querySelector('[data-atc-price]');
    const priceWrap = rootEl.querySelector('[data-price-wrap]');
    const stock = rootEl.querySelector('[data-stock]');
    const optionCount = variants[0].options.length;
    const qtyInput = form.querySelector('[name="quantity"]');
    let syncBundle = () => {};

    function selected() {
      if (!form.querySelector('[data-option-input]') && variants.length === 1) return variants[0].options.slice();
      const opts = [];
      for (let i = 0; i < optionCount; i++) {
        const checked = form.querySelector(`[data-option-input="${i}"]:checked`);
        opts.push(checked ? checked.value : null);
      }
      return opts;
    }
    function find(opts, list = variants) { return list.find((v) => v.options.length === opts.length && v.options.every((o, i) => o === opts[i])); }

    function paintAvailability(opts) {
      // Use preceding options only, so switching color cannot hide every route to a valid size.
      for (let i = 0; i < optionCount; i++) {
        form.querySelectorAll(`[data-option-input="${i}"]`).forEach((input) => {
          const matches = variants.filter((v) => v.options[i] === input.value && v.options.every((o, j) => j >= i || o === opts[j]));
          const avail = matches.some((v) => v.available);
          input.disabled = !avail;
          const pill = input.closest('.pill');
          pill?.classList.toggle('is-disabled', matches.length > 0 && !avail);
          pill?.classList.toggle('is-missing', !matches.length);
        });
      }
    }

    function update(pushState = true) {
      const opts = selected();
      const v = find(opts);
      paintAvailability(opts);
      opts.forEach((val, i) => { const lbl = rootEl.querySelector(`[data-option-value="${i}"]`); if (lbl && val) lbl.textContent = optionLabels[val] || val; });
      idInput.value = v && v.available ? v.id : '';
      const image = v?.featured_image;
      form.dataset.image = (image?.src || image || meta.image || '');
      if (!v) {
        atc.disabled = true; atcText.textContent = meta.strings.unavailable; if (atcPrice) atcPrice.textContent = '';
        if (stock) stock.textContent = meta.strings.unavailable;
        syncBundle();
        return;
      }
      if (priceWrap) {
        const sale = v.compare_at_price && v.compare_at_price > v.price;
        priceWrap.innerHTML = `<span class="price price--lg${sale ? ' price--sale' : ''}"><span class="price__current${sale ? ' price__sale' : ''}">${L.money(v.price)}</span>${sale ? `<s class="price__compare">${L.money(v.compare_at_price)}</s>` : ''}</span>`;
        const badge = rootEl.querySelector('[data-badge-sale]'); if (badge) badge.hidden = !sale;
      }
      if (atcPrice) atcPrice.textContent = L.money(v.price);
      atc.disabled = !v.available || form.dataset.cartSubmitting === '1';
      atcText.textContent = v.available ? meta.strings.addToBag : meta.strings.soldOut;
      if (stock) {
        if (!v.available) stock.innerHTML = `<span class="dot dot--off"></span>${meta.strings.soldOut}`;
        else if (v.inventory_management === 'shopify' && v.inventory_quantity > 0 && v.inventory_quantity <= meta.lowStock) stock.innerHTML = `<span class="dot dot--warn"></span>${meta.strings.lowStock.replace('[count]', v.inventory_quantity)}`;
        else stock.innerHTML = `<span class="dot"></span>${meta.strings.inStock}`;
      }
      // Gallery → variant image
      if (v.featured_media?.id || form.dataset.image) {
        const mid = v.featured_media?.id;
        const src = form.dataset.image;
        const gallery = rootEl.querySelector('[data-gallery]');
        if (gallery) {
          let slide = mid && gallery.querySelector(`[data-media-id="${mid}"]`);
          if (!slide && src) slide = Array.from(gallery.querySelectorAll('[data-gallery-slide] img')).find((img) => img.src.split('?')[0].endsWith(src.split('?')[0].split('/').pop()))?.closest('[data-gallery-slide]');
          if (slide) gallery.__goTo && gallery.__goTo(Number(slide.dataset.index), pushState);
        }
      }
      if (pushState && rootEl.dataset.product !== 'quick' && window.history && window.history.replaceState) {
        const u = new URL(location.href); u.searchParams.set('variant', v.id); history.replaceState({}, '', u);
      }
      syncBundle();
      L.emit('variant:change', { variant: v, root: rootEl });
    }

    form.addEventListener('change', (e) => { if (e.target.matches('[data-option-input]')) update(); });
    form.querySelectorAll('[data-qty-step]').forEach((b) => b.addEventListener('click', () => {
      if (form.classList.contains('is-bundling')) return;
      qtyInput.value = Math.max(1, Number(qtyInput.value) + Number(b.dataset.qtyStep));
      qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
    }));

    /* The form owns selection; cart.js consumes one validated items snapshot. */
    const bundle = rootEl.querySelector('[data-bundle]');
    let activeTier = null;
    let pieces = [];
    const bundleProducts = new Map();
    const pieceProduct = (piece) => bundleProducts.get(piece.querySelector('[data-bundle-product]').value);
    const pieceVariants = () => pieces.map((piece) => {
      const product = pieceProduct(piece);
      if (!product) return null;
      const inputs = Array.from(piece.querySelectorAll('[data-bundle-option-index]'));
      return find(inputs.length ? inputs.map((input) => input.value) : product.variants[0].options, product.variants);
    });
    const inventoryError = (items) => {
      const counts = new Map();
      items.forEach(({ variant, quantity }) => { if (variant) counts.set(variant.id, (counts.get(variant.id) || 0) + quantity); });
      return items.some(({ variant }) => variant?.inventory_management && variant.inventory_policy === 'deny'
        && Number.isFinite(variant.inventory_quantity) && counts.get(variant.id) > variant.inventory_quantity);
    };
    if (bundle) {
      JSON.parse(bundle.querySelector('[data-bundle-products]').textContent).forEach((product) => {
        if (product.variants.length) bundleProducts.set(product.handle, product);
      });
      const bStrings = JSON.parse(bundle.querySelector('[data-bundle-strings]')?.textContent || '{}');
      const tiers = Array.from(bundle.querySelectorAll('[data-bundle-tier]'));
      const container = bundle.querySelector('[data-bundle-pieces]');
      const template = bundle.querySelector('[data-bundle-piece]');
      const summary = bundle.querySelector('[data-bundle-summary]');
      const cachedPieces = [];
      const optionKey = (name) => {
        const key = name.toLowerCase();
        if (['color', 'colour', 'اللون'].includes(key)) return 'color';
        if (['size', 'sizes', 'المقاس', 'مقاس'].includes(key)) return 'size';
        return key;
      };
      const buildOptions = (piece, previous) => {
        const product = pieceProduct(piece);
        const seed = product?.variants.find((variant) => variant.available && !variant.requires_selling_plan) || product?.variants[0];
        const fields = (product?.options || []).map((option, index) => {
          const label = document.createElement('label'); label.className = 'bundle__option';
          const caption = document.createElement('span'); caption.textContent = option.label;
          const input = document.createElement('select'); input.className = 'input'; input.required = true;
          input.dataset.bundleOptionIndex = String(index); input.dataset.bundleOptionName = optionKey(option.name);
          const placeholder = document.createElement('option');
          placeholder.value = ''; placeholder.textContent = `${bundleText.select} ${option.label}`; placeholder.disabled = true;
          input.appendChild(placeholder);
          option.values.forEach(({ value, label }) => {
            const choice = document.createElement('option'); choice.value = value; choice.textContent = label; choice.dataset.label = label;
            input.appendChild(choice);
          });
          const old = previous.get(optionKey(option.name));
          const match = option.values.find(({ value }) => value === old)
            || option.values.find(({ value }) => old && value.toLowerCase() === old.toLowerCase());
          // Retain the shopper's size across sibling handles; never silently substitute a different size.
          input.value = option.values.length === 1 ? option.values[0].value : old !== undefined ? (match?.value || '') : seed?.options[index] || '';
          label.appendChild(caption); label.appendChild(input);
          return label;
        });
        piece.querySelector('[data-bundle-options]').replaceChildren(...fields);
      };
      activeTier = tiers[0];
      syncBundle = () => {
        const resolved = pieceVariants();
        const total = resolved.reduce((sum, v) => sum + (v?.price || 0), 0);
        const invalid = resolved.some((v) => !v?.available || v.requires_selling_plan);
        const overstock = inventoryError(resolved.map((variant) => ({ variant, quantity: 1 })));
        tiers.forEach((tier) => {
          tier.classList.toggle('is-active', tier === activeTier);
          tier.setAttribute('aria-pressed', String(tier === activeTier));
          const price = tier === activeTier && pieces.length ? (invalid ? null : total / pieces.length) : find(selected())?.price;
          const each = tier.querySelector('[data-bundle-each]');
          const pct = Number(tier.dataset.pct);
          const mixed = tier === activeTier && resolved.some((v) => v?.price !== resolved[0]?.price);
          if (each) each.textContent = price == null ? meta.strings.unavailable
            : mixed ? `${bundleText.average}: ${L.money(Math.round(price * (100 - pct) / 100))}`
              : `${pct ? bundleText.estimate + ': ' : ''}${(bStrings.each || '[price]').replace('[price]', L.money(Math.round(price * (100 - pct) / 100)))}`;
        });
        if (!pieces.length) return;
        const pct = Number(activeTier.dataset.pct);
        const saving = Math.round(total * pct / 100);
        pieces.forEach((piece, i) => {
          const v = resolved[i];
          const product = pieceProduct(piece);
          const img = piece.querySelector('[data-bundle-image]');
          const src = v?.featured_image?.src || v?.featured_image || product?.image || '';
          img.hidden = !src;
          if (src) { img.src = src; img.alt = product.title; }
          piece.classList.toggle('is-unavailable', !v?.available || v.requires_selling_plan || overstock);
          piece.querySelector('[data-bundle-piece-status]').textContent = !v ? meta.strings.unavailable
            : !v.available ? meta.strings.soldOut : v.requires_selling_plan ? bundleText.oneTime : overstock ? bundleText.stock : L.money(v.price);
          const inputs = Array.from(piece.querySelectorAll('[data-bundle-option-index]'));
          const opts = inputs.map((input) => input.value);
          inputs.forEach((input, index) => Array.from(input.options).forEach((option) => {
            if (!option.value) return;
            // Earlier options remain reachable even when a later option must also change.
            const matches = product.variants.filter((variant) => variant.options[index] === option.value
              && variant.options.every((value, j) => j >= index || value === opts[j]));
            const available = matches.some((variant) => variant.available && !variant.requires_selling_plan);
            option.disabled = !available;
            option.textContent = (option.dataset.label || option.value)
              + (available ? '' : ` (${matches.length ? meta.strings.soldOut : meta.strings.unavailable})`);
          }));
        });
        summary.textContent = invalid ? bundleText.choose : overstock ? bundleText.stock
          : `${bundleText.subtotal}: ${L.money(total)}\n${bundleText.savings} (${pct}%): ${L.money(saving)}\n${bundleText.total}: ${L.money(total - saving)}`;
        atc.disabled = invalid || overstock || form.dataset.cartSubmitting === '1';
        atcText.textContent = invalid || overstock ? bundleText.choose : meta.strings.addToBag;
        if (atcPrice) atcPrice.textContent = invalid ? '' : L.money(total);
        const firstImage = resolved[0]?.featured_image;
        form.dataset.image = firstImage?.src || firstImage || pieceProduct(pieces[0])?.image || '';
        if (stock) stock.textContent = invalid ? bundleText.choose : overstock ? bundleText.stock : meta.strings.inStock;
        const stickyPrice = rootEl.dataset.product === 'quick' ? null : document.querySelector('[data-sticky-price]');
        if (stickyPrice) stickyPrice.textContent = atcPrice?.textContent || '';
      };
      tiers.forEach((tier) => tier.addEventListener('click', () => {
        if (form.dataset.cartSubmitting === '1') return;
        activeTier = tier;
        const count = Number(tier.dataset.qty);
        const seed = selected();
        pieces = [];
        for (let i = 0; count > 1 && i < count; i++) {
          if (!cachedPieces[i]) {
            const piece = template.content.firstElementChild.cloneNode(true);
            piece.querySelector('[data-bundle-piece-title]').textContent = `${bundleText.piece} ${i + 1}`;
            const productInput = piece.querySelector('[data-bundle-product]');
            bundleProducts.forEach((product) => {
              const option = document.createElement('option'); option.value = product.handle; option.textContent = product.title;
              option.disabled = !product.variants.some((variant) => variant.available && !variant.requires_selling_plan);
              if (option.disabled) option.textContent += ` (${meta.strings.unavailable})`;
              productInput.appendChild(option);
            });
            productInput.value = meta.handle || rootEl.dataset.productHandle;
            piece.querySelector('[data-bundle-product-label]').hidden = bundleProducts.size < 2;
            const product = pieceProduct(piece);
            buildOptions(piece, new Map((product?.options || []).map((option, index) => [optionKey(option.name), seed[index]])));
            piece.addEventListener('change', (event) => {
              if (event.target === productInput) {
                const previous = new Map(Array.from(piece.querySelectorAll('[data-bundle-option-index]')).map((input) => [input.dataset.bundleOptionName, input.value]));
                buildOptions(piece, previous);
              }
              syncBundle();
            });
            cachedPieces[i] = piece;
          }
          pieces.push(cachedPieces[i]);
        }
        container.replaceChildren(...pieces);
        container.hidden = summary.hidden = count === 1;
        form.classList.toggle('is-bundling', count > 1);
        qtyInput.value = count;
        update(false);
        L.buzz();
      }));
    }
    form.refreshProduct = () => update(false);
    form.getCartItems = (fd) => {
      update(false);
      const quantity = pieces.length ? 1 : Number(fd.get('quantity') || 1);
      if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error(bundleText.quantity);
      const resolved = pieces.length ? pieceVariants() : [find(selected())];
      if (resolved.some((variant) => !variant?.available)) throw new Error(pieces.length ? bundleText.choose : meta.strings.unavailable);
      if (pieces.length && (fd.get('selling_plan') || resolved.some((variant) => variant.requires_selling_plan))) throw new Error(bundleText.oneTime);
      if (inventoryError(resolved.map((variant) => ({ variant, quantity })))) throw new Error(bundleText.stock);
      const properties = Object.create(null);
      for (const [key, value] of fd.entries()) {
        const match = key.match(/^properties\[(.+)\]$/);
        if (match && ((typeof value === 'string' && value) || (value instanceof File && value.size))) properties[match[1]] = value;
      }
      const group = pieces.length ? `bundle-${crypto.randomUUID()}` : null;
      const bundleOffer = bundle?.dataset.offerTitle || (ar ? 'عرض الباندل' : 'Bundle offer');
      const bundleDiscount = Number(activeTier?.dataset.pct || 0);
      return resolved.map((variant, index) => ({
        id: variant.id, quantity,
        ...(fd.get('selling_plan') ? { selling_plan: fd.get('selling_plan') } : {}),
        properties: { ...properties, ...(group ? {
          'Bundle offer': `${bundleOffer} · ${pieces.length} ${ar ? 'قطع' : 'pieces'}`,
          'Expected bundle discount': `${bundleDiscount}% (${ar ? 'تقديري فقط؛ يحسب Shopify الخصم الفعلي' : 'estimate only; Shopify calculates actual discounts'})`,
          'Bundle piece': `${index + 1} / ${pieces.length}`,
          'Bundle selection': `${ar ? 'القطعة' : 'Piece'} ${index + 1}: ${variant.options.filter(Boolean).join(' / ')}`,
          '_bundle_id': group,
          '_bundle_offer_id': `linux-bundle-${pieces.length}-${Number(activeTier.dataset.pct)}`,
          '_bundle_quantity': String(pieces.length),
          '_bundle_discount_pct': String(Number(activeTier.dataset.pct)),
        } : {}) },
      }));
    };

    /* Fit finder: height/weight → size. Heuristic (weight band, nudged by height + BMI);
       the cut is oversized, so "true to size" shifts one down. */
    const fit = rootEl.querySelector('[data-fit]');
    if (fit) {
      const fStrings = JSON.parse(fit.querySelector('[data-fit-strings]')?.textContent || '{}');
      const ORDER = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];
      const norm = (v) => v.toUpperCase().replace('XXL', '2XL');
      const sizeInputs = Array.from(form.querySelectorAll('[data-option-input]')).filter((i) => ORDER.includes(norm(i.value)));
      const available = ORDER.filter((sz) => sizeInputs.some((i) => norm(i.value) === sz));
      let style = 'oversized';
      fit.querySelectorAll('[data-fit-style]').forEach((b) => b.addEventListener('click', () => {
        style = b.dataset.fitStyle;
        fit.querySelectorAll('[data-fit-style]').forEach((x) => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      }));
      const suggest = (h, w) => {
        const bmi = w / Math.pow(h / 100, 2);
        let idx = w < 58 ? 1 : w < 70 ? 2 : w < 84 ? 3 : w < 98 ? 4 : w < 112 ? 5 : 6;
        if (h >= 186) idx += 1; else if (h < 165) idx -= 1;
        if (bmi >= 30) idx += 1; else if (bmi < 19) idx -= 1;
        if (style === 'regular') idx -= 1;
        return Math.max(0, Math.min(ORDER.length - 1, idx));
      };
      const result = fit.querySelector('[data-fit-result]');
      fit.querySelector('[data-fit-calc]').addEventListener('click', () => {
        const h = Number(fit.querySelector('[data-fit-height]').value), w = Number(fit.querySelector('[data-fit-weight]').value);
        if (!h || !w) { fit.querySelector(h ? '[data-fit-weight]' : '[data-fit-height]').focus(); return; }
        const idx = suggest(h, w);
        let size = ORDER[idx];
        if (available.length && !available.includes(size)) {
          size = available.reduce((best, sz) => (Math.abs(ORDER.indexOf(sz) - idx) < Math.abs(ORDER.indexOf(best) - idx) ? sz : best), available[0]);
        }
        const alt = available.find((sz) => ORDER.indexOf(sz) === ORDER.indexOf(size) + 1);
        fit.querySelector('[data-fit-size]').textContent = size;
        fit.querySelector('[data-fit-alt]').textContent = alt && fStrings.alt ? fStrings.alt.replace('[size]', alt) : '';
        result.hidden = false; result.dataset.size = size; L.buzz();
      });
      fit.querySelector('[data-fit-select]').addEventListener('click', () => {
        const target = sizeInputs.find((i) => norm(i.value) === result.dataset.size);
        if (target) { target.checked = true; target.dispatchEvent(new Event('change', { bubbles: true })); target.closest('.pill')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      });
    }

    /* Gallery */
    const gallery = rootEl.querySelector('[data-gallery]');
    if (gallery) {
      const track = gallery.querySelector('[data-gallery-track]');
      const slides = Array.from(gallery.querySelectorAll('[data-gallery-slide]'));
      const thumbs = Array.from(gallery.querySelectorAll('[data-gallery-thumb]'));
      const dots = Array.from(gallery.querySelectorAll('.gallery__dot'));
      let index = 0;
      const paint = () => {
        thumbs.forEach((t, i) => t.classList.toggle('is-active', i === index));
        dots.forEach((d, i) => d.classList.toggle('is-active', i === index));
      };
      const goTo = (i, smooth = true) => {
        index = Math.max(0, Math.min(slides.length - 1, i));
        const target = slides[index];
        if (target) track.scrollTo({ left: target.offsetLeft - track.offsetLeft, behavior: smooth ? 'smooth' : 'auto' });
        paint();
      };
      gallery.__goTo = goTo;
      thumbs.forEach((t) => t.addEventListener('click', () => goTo(Number(t.dataset.galleryThumb))));
      gallery.querySelector('[data-gallery-prev]')?.addEventListener('click', () => goTo(index - 1));
      gallery.querySelector('[data-gallery-next]')?.addEventListener('click', () => goTo(index + 1));
      let st;
      track.addEventListener('scroll', () => { clearTimeout(st); st = setTimeout(() => { const w = track.clientWidth; index = Math.round(Math.abs(track.scrollLeft) / w); paint(); }, 80); }, { passive: true });
      // Lightbox
      const lb = rootEl.dataset.product === 'quick' ? null : document.querySelector('[data-lightbox]');
      const openLb = () => {
        const img = slides[index]?.querySelector('img'); if (!img || !lb) return;
        lb.querySelector('[data-lightbox-img]').src = img.dataset.zoomSrc || img.src;
        lb.classList.add('is-open'); lb.setAttribute('aria-hidden', 'false'); lb.removeAttribute('inert'); document.body.classList.add('drawer-open');
      };
      const closeLb = () => { if (!lb?.classList.contains('is-open')) return; lb.classList.remove('is-open'); lb.setAttribute('aria-hidden', 'true'); lb.setAttribute('inert', ''); document.body.classList.remove('drawer-open'); };
      gallery.querySelector('[data-gallery-zoom]')?.addEventListener('click', openLb);
      slides.forEach((s) => s.addEventListener('click', (e) => { if (matchMedia('(pointer: fine)').matches && e.target.tagName === 'IMG') openLb(); }));
      lb?.addEventListener('click', closeLb);
      const onKey = (e) => { if (e.key === 'Escape') closeLb(); if (lb?.classList.contains('is-open')) return; if (gallery.contains(document.activeElement)) { if (e.key === 'ArrowRight') goTo(index + 1); if (e.key === 'ArrowLeft') goTo(index - 1); } };
      document.addEventListener('keydown', onKey);
      rootEl.destroyProduct = () => { clearTimeout(st); document.removeEventListener('keydown', onKey); lb?.removeEventListener('click', closeLb); };
    }

    /* Sticky ATC (page only) */
    const sticky = document.querySelector('[data-sticky-atc]');
    if (sticky && atc && rootEl.dataset.product !== 'quick') {
      const io = new IntersectionObserver(([en]) => { const show = !en.isIntersecting && en.boundingClientRect.top < 0; sticky.classList.toggle('is-visible', show); sticky.setAttribute('aria-hidden', String(!show)); }, { threshold: 0 });
      io.observe(atc);
      sticky.querySelector('[data-sticky-submit]')?.addEventListener('click', () => { if (atc.disabled) { atc.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; } form.requestSubmit(); });
      L.on('variant:change', ({ variant, root: changedRoot }) => { if (changedRoot !== rootEl) return; const p = sticky.querySelector('[data-sticky-price]'); if (p) p.textContent = atcPrice?.textContent || L.money(variant.price); });
    }
    // The gallery must exist before the initial variant (including ?variant=) is painted.
    update(false);

    /* Recently viewed: record */
    if (rootEl.dataset.product !== 'quick' && meta.handle) {
      try {
        const key = 'linux:recent';
        const list = JSON.parse(localStorage.getItem(key) || '[]').filter((h) => h !== meta.handle);
        list.unshift(meta.handle);
        localStorage.setItem(key, JSON.stringify(list.slice(0, 10)));
      } catch {}
    }
  }

  document.querySelectorAll('[data-product]').forEach(initProduct);
  L.initProduct = initProduct;

  /* ------------------------------------------------------------------ */
  /* Quick view                                                          */
  /* ------------------------------------------------------------------ */
  let quickRequest = 0;
  let quickFetch = null;
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-quick-view]');
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    const handle = btn.dataset.quickView;
    if (!handle) return;
    const productUrl = `${root}/products/${encodeURIComponent(handle)}`;
    const modal = document.querySelector('[data-modal="quick-view"]');
    const content = modal?.querySelector('[data-quick-view-content]');
    if (!modal || !content) { location.href = productUrl; return; }
    const request = ++quickRequest;
    quickFetch?.abort();
    const controller = new AbortController();
    quickFetch = controller;
    content.querySelector('[data-product]')?.destroyProduct?.();
    content.innerHTML = '<div class="skeleton" style="height:320px;border-radius:var(--r-lg)"></div>';
    content.setAttribute('aria-busy', 'true');
    if (L.drawers.active !== modal) L.drawers.open('quick-view', btn);
    try {
      // A static section_id loses blocks/settings from native JSON product templates.
      const res = await fetch(productUrl, { signal: controller.signal, credentials: 'same-origin' });
      if (!res.ok) throw new Error(`Product request failed (${res.status})`);
      const html = await res.text();
      if (request !== quickRequest || controller.signal.aborted) return;
      const tpl = document.createElement('div'); tpl.innerHTML = html;
      const pdp = tpl.querySelector('[data-product]');
      if (!pdp?.querySelector('[data-product-form]') || !pdp.querySelector('[data-variants]')
        || pdp.dataset.productHandle !== handle || pdp.hasAttribute('data-customize')) throw new Error('Invalid product response');
      pdp.dataset.product = 'quick';
      delete pdp.dataset.ready;
      pdp.classList.add('pdp--quick');
      pdp.querySelectorAll('.pdp__crumbs, .pdp__details, [data-fit], .pdp__fit, .pdp__delivery, .pdp__wa, .pdp__rating, [data-sticky-atc], [data-recommendations], [data-recently-viewed], [data-lightbox], [data-drawer], [data-gallery-zoom], [data-drawer-open="size-guide"], script:not([type="application/json"]), style, link[rel="stylesheet"]').forEach((el) => el.remove());
      // Remap ID references too, so labels, forms, ARIA and SVGs stay local to the modal.
      const nodes = [pdp, ...pdp.querySelectorAll('*')];
      // Template contents are separate document fragments and may be cloned later.
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].tagName === 'TEMPLATE') nodes.push(...nodes[i].content.querySelectorAll('*'));
      }
      const ids = new Map();
      nodes.filter((el) => el.id).forEach((el, index) => {
        const old = el.id;
        el.id = `quick-${request}-${index}-${old}`;
        if (!ids.has(old)) ids.set(old, el.id);
      });
      nodes.forEach((el) => {
        ['for', 'form', 'list', 'headers', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant', 'aria-details', 'aria-errormessage'].forEach((attr) => {
          if (el.hasAttribute(attr)) el.setAttribute(attr, el.getAttribute(attr).split(/\s+/).map((id) => ids.get(id) || id).join(' '));
        });
        ['href', 'xlink:href'].forEach((attr) => {
          const value = el.getAttribute(attr);
          if (value?.startsWith('#') && ids.has(value.slice(1))) el.setAttribute(attr, `#${ids.get(value.slice(1))}`);
        });
        Array.from(el.attributes).forEach((attr) => {
          if (attr.value.includes('url(#')) el.setAttribute(attr.name, attr.value.replace(/url\(#([^)]+)\)/g, (match, id) => ids.has(id) ? `url(#${ids.get(id)})` : match));
        });
      });
      const link = document.createElement('a');
      link.className = 'btn btn--ghost btn--sm btn--block'; link.href = productUrl; link.textContent = L.strings.view_full || (ar ? 'عرض التفاصيل الكاملة' : 'View full details');
      pdp.querySelector('.pdp__panel')?.appendChild(link);
      content.replaceChildren(pdp);
      initProduct(pdp);
      if (!pdp.querySelector('[data-product-form]').getCartItems) throw new Error('Product could not be initialized');
    } catch (err) {
      if (request !== quickRequest || controller.signal.aborted) return;
      content.querySelector('[data-product]')?.destroyProduct?.();
      const error = document.createElement('p');
      error.className = 'muted'; error.setAttribute('role', 'alert');
      error.textContent = L.strings.error || (ar ? 'تعذر تحميل المنتج.' : 'Could not load this product.');
      const link = document.createElement('a');
      link.className = 'btn btn--ghost btn--block'; link.href = productUrl;
      link.textContent = L.strings.view_full || (ar ? 'عرض التفاصيل الكاملة' : 'View full details');
      content.replaceChildren(error, link);
    } finally {
      if (request === quickRequest) { content.removeAttribute('aria-busy'); quickFetch = null; }
    }
  });
  L.on('drawer:close', ({ name, el }) => {
    if (name !== 'quick-view') return;
    ++quickRequest;
    quickFetch?.abort(); quickFetch = null;
    const content = el.querySelector('[data-quick-view-content]');
    content?.querySelector('[data-product]')?.destroyProduct?.();
    content?.replaceChildren(); content?.removeAttribute('aria-busy');
  });

  /* ------------------------------------------------------------------ */
  /* Recommendations                                                     */
  /* ------------------------------------------------------------------ */
  document.querySelectorAll('[data-recommendations]').forEach(async (sec) => {
    if (sec.querySelector('.product-grid')) return;
    try {
      const res = await fetch(sec.dataset.url);
      if (!res.ok) return;
      const html = await res.text();
      const tpl = document.createElement('div'); tpl.innerHTML = html;
      const fresh = tpl.querySelector('[data-recommendations]');
      if (fresh && fresh.innerHTML.trim()) sec.innerHTML = fresh.innerHTML;
    } catch {}
  });

  /* ------------------------------------------------------------------ */
  /* Recently viewed rail                                                */
  /* ------------------------------------------------------------------ */
  const rv = document.querySelector('[data-recently-viewed]');
  if (rv) {
    const current = document.querySelector('[data-product-handle]')?.dataset.productHandle;
    let list = [];
    try { list = JSON.parse(localStorage.getItem('linux:recent') || '[]'); } catch {}
    list = list.filter((h) => h !== current).slice(0, 8);
    if (list.length) {
      const track = rv.querySelector('[data-recently-viewed-track]');
      Promise.all(list.map(async (h) => {
        try {
          const p = await L.fetchJSON(`${root}/products/${h}.js`);
          const img = p.featured_image ? (p.featured_image.includes('cdn.shopify.com') ? p.featured_image.replace(/(\.[a-z]+)(\?|$)/, '_720x$1$2') : p.featured_image) : '';
          const sale = p.compare_at_price && p.compare_at_price > p.price;
          return `<article class="card glass glass--hover" data-product-card data-handle="${p.handle}"><div class="card__media"><a href="${p.url}"><img class="card__img--main" src="${img}" alt="${L.title(p.title)}" width="720" height="960" loading="lazy"></a><button class="card__wish" type="button" data-wishlist-toggle="${p.handle}" aria-pressed="false"><svg class="icon icon--heart" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/></svg><svg class="icon icon--heart-fill" width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/></svg></button><div class="card__quick glass glass--solid"><button class="btn btn--ghost btn--sm btn--block" type="button" data-quick-view="${p.handle}">${L.strings.products ? '' : ''}Quick view</button></div></div><div class="card__body"><h3 class="card__title"><a href="${p.url}">${L.title(p.title)}</a></h3><p class="card__meta">${p.type || ''}</p><div class="card__price"><span class="price"><span class="price__current${sale ? ' price__sale' : ''}">${L.money(p.price)}</span>${sale ? `<s class="price__compare">${L.money(p.compare_at_price)}</s>` : ''}</span></div></div></article>`;
        } catch { return ''; }
      })).then((cards) => { const html = cards.join(''); if (html) { track.innerHTML = html; rv.hidden = false; } });
    }
  }
})();
