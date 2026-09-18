/* LINUX — Customize studio v4
   Two independent designs (front + back), each with its own file, position,
   scale and rotation, on real garment photos per colour/side. The shopper can
   drag, pinch, wheel-zoom, rotate (knob, slider, keyboard) and nudge with the
   arrow keys. On submit each side that carries a design gets a composited
   JPEG mockup attached as a file property, so the order shows the garment
   exactly as designed. Variant/price: colour → the product's "Color" option,
   method → its "Type" option. */
(function () {
  'use strict';
  const L = window.LINUX;
  const root = document.querySelector('[data-customize]');
  if (!root) return;
  const meta = JSON.parse(root.querySelector('[data-product-json]')?.textContent || '{}');
  const variants = JSON.parse(root.querySelector('[data-variants]')?.textContent || '[]');
  const strings = meta.strings || {};
  const MAX = Number(root.dataset.maxMb || 10) * 1024 * 1024;
  const MIN_EMB = Number(root.dataset.minEmbroidery || 10);
  const MAX_QTY = Number(root.dataset.maxQty || 50);
  const AREA = meta.area || {};
  const SCALE_MIN = 10, SCALE_MAX = 90;
  const SIDES = ['front', 'back'];

  const q = (s) => root.querySelector(s);
  const qa = (s) => Array.from(root.querySelectorAll(s));
  const canvas = q('[data-cz-canvas]'), garment = q('[data-cz-garment]');
  const empty = q('[data-cz-pick]'), emptyLabel = q('[data-cz-empty-label]'), err = q('[data-cz-error]');
  const garmentProp = q('[data-cz-garment-prop]'), colorProp = q('[data-cz-color-prop]'), methodProp = q('[data-cz-method-prop]'), sidesProp = q('[data-cz-sides-prop]'), sizesProp = q('[data-cz-sizes-prop]');
  const qtyField = q('[data-cz-qty-field]'), qtyInput = q('[data-cz-qty]'), sizesList = q('[data-cz-sizes-list]'), sizeTpl = q('[data-cz-size-row]');
  const scale = q('[data-cz-scale]'), scaleOut = q('[data-cz-scale-out]'), rotate = q('[data-cz-rotate]'), rotateOut = q('[data-cz-rotate-out]');
  const form = q('[data-cz-form]'), submitErr = q('[data-cz-submit-error]'), total = q('[data-cz-total]'), breakdown = q('[data-cz-breakdown]');
  const minNotice = q('[data-cz-min-notice]'), eta = q('[data-cz-eta]'), idInput = q('[data-variant-id]'), atcPrice = q('[data-atc-price]'), wa = q('[data-cz-wa]');
  const tools = q('[data-cz-tools]'), hint = q('[data-cz-hint]'), area = q('[data-cz-area]'), colorLabel = q('[data-cz-color-label]'), fine = q('[data-cz-fine]'), fineSide = q('[data-cz-fine-side]');
  const firstColor = q('[data-cz-color].is-active') || q('[data-cz-color]');

  // per-side design state
  const design = {};
  SIDES.forEach((side) => {
    design[side] = { x: 50, y: 42, s: 42, r: 0, has: false, file: null,
      el: q(`[data-cz-design="${side}"]`), img: q(`[data-cz-design="${side}"] img`), input: q(`[data-cz-file="${side}"]`),
      drop: q(`[data-cz-drop="${side}"]`), row: q(`[data-cz-file-row="${side}"]`), pos: q(`[data-cz-pos="${side}"]`), mock: q(`[data-cz-mockup="${side}"]`), dot: q(`[data-cz-side-dot="${side}"]`) };
  });

  const state = {
    side: root.dataset.side || 'back', shape: root.dataset.shape || 'hoodie',
    label: q('[data-cz-garment-opt].is-active')?.dataset.label || 'Hoodie',
    colorKey: firstColor?.dataset.czColor, color: firstColor?.dataset.czColorName || '', colorValue: firstColor?.dataset.czVariantValue || '', hex: firstColor?.dataset.czHex || '#181818',
    method: 'Print', qty: 1, sizes: [], unit: meta.price || 0,
  };
  const cur = () => design[state.side];
  const sideName = (s) => (s === 'back' ? strings.back : strings.front) || s;

  /* ---- Print area per garment/side: [cx, cy, w, h] in % of the stage ---- */
  function printArea(side = state.side) { const a = (AREA[state.shape] || {})[side]; return a || [50, 45, 52, 52]; }
  function paintArea() {
    const [cx, cy, w, h] = printArea();
    area.style.left = cx + '%'; area.style.top = cy + '%'; area.style.width = w + '%'; area.style.height = h + '%';
  }
  function clampPos(d, side) {
    const [cx, cy, w, h] = printArea(side);
    const half = d.s / 2;
    d.x = Math.max(cx - w / 2 + Math.min(half, w / 2) * .35, Math.min(cx + w / 2 - Math.min(half, w / 2) * .35, d.x));
    d.y = Math.max(cy - h / 2 + Math.min(half, h / 2) * .35, Math.min(cy + h / 2 - Math.min(half, h / 2) * .35, d.y));
  }
  function centerInArea(d = cur(), side = state.side) { const [cx, cy] = printArea(side); d.x = cx; d.y = cy; }

  /* ---- Variant / price ---- */
  const lc = (v) => String(v == null ? '' : v).toLowerCase().trim();
  function pickVariant() {
    const wantMethod = lc((meta.methodValues || {})[state.method] || state.method);
    const wantColor = lc(state.colorValue || state.color);
    const has = (v, val) => v.options.some((o) => lc(o) === val);
    let list = variants.filter((v) => has(v, wantMethod));
    if (!list.length) list = variants.slice();
    const byColor = list.filter((v) => has(v, wantColor));
    if (byColor.length) list = byColor;
    return list.find((v) => v.available) || list[0] || variants.find((v) => v.available) || variants[0];
  }

  /* ---- Photo / mockup layers ---- */
  function showLayer(side = state.side) {
    const want = `${state.colorKey}|${state.shape}-${side}`;
    let photo = null;
    qa('[data-cz-photo]').forEach((img) => { const on = img.dataset.czPhoto === want; img.hidden = !on; if (on) photo = img; });
    qa('[data-cz-mock]').forEach((m) => { m.hidden = !!photo || m.dataset.czMock !== `${state.shape}-${side}`; });
    garment.style.setProperty('--gc', state.hex);
    garment.classList.toggle('has-photo', !!photo);
    const hex = state.hex.replace('#', ''); const n = parseInt(hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex, 16);
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    garment.classList.toggle('is-light', lum > .6);
    return photo;
  }

  function paintDesign(side) {
    const d = design[side];
    clampPos(d, side);
    d.el.style.setProperty('--dx', d.x + '%'); d.el.style.setProperty('--dy', d.y + '%');
    d.el.style.setProperty('--ds', d.s); d.el.style.setProperty('--dr', d.r + 'deg');
    d.el.hidden = !(d.has && side === state.side);
    d.pos.value = `x:${Math.round(d.x)},y:${Math.round(d.y)},scale:${Math.round(d.s)},rotate:${Math.round(d.r)}`;
    d.pos.disabled = !d.has;
    d.drop.hidden = d.has; d.row.hidden = !d.has;
    if (d.dot) d.dot.hidden = !d.has;
  }

  function paint() {
    SIDES.forEach(paintDesign);
    const d = cur();
    garmentProp.value = state.label;
    methodProp.value = state.method;
    colorProp.value = state.color;
    const withDesign = SIDES.filter((s) => design[s].has);
    sidesProp.value = withDesign.length === 2 ? (strings.both || 'Front + Back') : withDesign.map(sideName).join('');
    if (scale) { scale.value = Math.round(d.s); if (scaleOut) scaleOut.value = Math.round(d.s) + '%'; }
    if (rotate) { rotate.value = Math.round(d.r); if (rotateOut) rotateOut.value = Math.round(d.r) + '°'; }
    root.dataset.shape = state.shape; root.dataset.side = state.side;
    showLayer(); paintArea();
    empty.hidden = d.has;
    if (emptyLabel) emptyLabel.textContent = (strings.uploadSide || 'Upload [side] design').replace('[side]', sideName(state.side));
    if (fineSide) fineSide.textContent = sideName(state.side);
    if (fine) fine.classList.toggle('is-disabled', !d.has);
    qtyField.value = state.qty;
    sizesProp.value = state.sizes.map((sz, i) => `${i + 1}:${sz}`).join(', ');
    const v = pickVariant();
    if (v) { state.unit = v.price; idInput.value = v.id; }
    const sum = state.unit * state.qty;
    if (total) total.textContent = L.money(sum);
    if (atcPrice) atcPrice.textContent = L.money(sum);
    if (breakdown) breakdown.textContent = state.qty > 1 && strings.perPiece ? strings.perPiece.replace('[price]', L.money(state.unit)) : '';
    const short = state.method === 'Embroidery' && state.qty < MIN_EMB;
    minNotice.hidden = state.method !== 'Embroidery';
    minNotice.classList.toggle('is-blocking', short);
    if (eta) eta.textContent = state.method === 'Embroidery' ? (strings.etaEmbroidery || '') : (strings.etaPrint || '');
    if (tools) tools.hidden = !d.has;
    if (hint) hint.textContent = d.has ? (strings.hintDesign || strings.hint || '') : (strings.hint || '');
    if (colorLabel) colorLabel.textContent = q('[data-cz-color].is-active')?.getAttribute('aria-label') || state.color;
    if (wa) {
      const txt = `${strings.wa || ''} ${state.label} · ${state.color} · ${state.method} · ${sidesProp.value || '-'} · ${state.qty} pcs${state.sizes.length ? ' (' + state.sizes.join(', ') + ')' : ''}`;
      wa.href = wa.href.replace(/\?text=.*$/, '') + '?text=' + encodeURIComponent(txt.trim());
    }
  }

  /* ---- Sizes ---- */
  function renderSizes() {
    const prev = state.sizes.slice();
    sizesList.innerHTML = '';
    state.sizes = [];
    for (let i = 0; i < state.qty; i++) {
      const row = sizeTpl.content.firstElementChild.cloneNode(true);
      row.querySelector('.cz__size-n').textContent = (strings.piece || 'Piece [n]').replace('[n]', i + 1);
      const inputs = row.querySelectorAll('input');
      inputs.forEach((inp) => { inp.name = `cz-size-${i}`; inp.checked = false; });
      const want = prev[i];
      const match = want && Array.from(inputs).find((inp) => inp.value === want);
      const chosen = match || inputs[Math.min(1, inputs.length - 1)];
      chosen.checked = true; state.sizes.push(chosen.value);
      row.addEventListener('change', (e) => { if (e.target.matches('input')) { state.sizes[i] = e.target.value; paint(); } });
      sizesList.appendChild(row);
    }
    q('[data-cz-sizes]').classList.toggle('is-many', state.qty > 6);
  }
  function setQty(n) {
    state.qty = Math.max(1, Math.min(MAX_QTY, Math.round(Number(n) || 1)));
    qtyInput.value = state.qty;
    qa('[data-cz-qty-set]').forEach((c) => c.classList.toggle('is-active', Number(c.dataset.czQtySet) === state.qty));
    renderSizes(); paint();
  }
  qa('[data-cz-qty-step]').forEach((b) => b.addEventListener('click', () => { setQty(state.qty + Number(b.dataset.czQtyStep)); L.buzz(); }));
  qa('[data-cz-qty-set]').forEach((b) => b.addEventListener('click', () => { setQty(b.dataset.czQtySet); L.buzz(); }));
  qtyInput.addEventListener('change', () => setQty(qtyInput.value));

  /* ---- Method ---- */
  qa('[data-cz-method]').forEach((b) => b.addEventListener('click', () => {
    qa('[data-cz-method]').forEach((x) => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    state.method = b.dataset.czMethod;
    if (state.method === 'Embroidery' && state.qty < MIN_EMB) { minNotice.hidden = false; minNotice.classList.add('is-pulse'); setTimeout(() => minNotice.classList.remove('is-pulse'), 700); }
    paint(); L.buzz();
  }));

  /* ---- Side tabs ---- */
  function setSide(side, animate = true) {
    if (state.side === side) return;
    qa('[data-cz-side]').forEach((b) => { const on = b.dataset.czSide === side; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); });
    state.side = side;
    if (animate) { garment.classList.remove('is-flip'); void garment.offsetWidth; garment.classList.add('is-flip'); setTimeout(paint, 180); }
    else paint();
    L.buzz();
  }
  qa('[data-cz-side]').forEach((btn) => btn.addEventListener('click', () => setSide(btn.dataset.czSide)));

  /* ---- Upload (per side) ---- */
  function showError(msg) { err.textContent = msg; err.hidden = !msg; }
  function setFile(side, file) {
    showError('');
    if (!file) return;
    const d = design[side];
    if (file.size > MAX) { showError(strings.fileTooBig); d.input.value = ''; return; }
    if (!/^image\/(png|jpe?g|svg\+xml|webp)$/.test(file.type)) { showError(strings.fileType); d.input.value = ''; return; }
    const url = URL.createObjectURL(file);
    d.img.onload = () => {
      centerInArea(d, side); d.s = 42; d.r = 0; d.has = true; d.file = file;
      if (state.side !== side) setSide(side, false);
      d.el.classList.remove('is-pop'); void d.el.offsetWidth; d.el.classList.add('is-pop');
      paint(); L.buzz();
    };
    d.img.src = url;
    const thumb = d.row.querySelector('[data-cz-thumb]'); if (thumb) thumb.src = url;
    d.row.querySelector('[data-cz-filename]').textContent = file.name;
    d.row.querySelector('[data-cz-filesize]').textContent = (file.size / 1024).toFixed(0) + ' KB';
  }
  function clearFile(side) {
    const d = design[side];
    d.input.value = ''; d.img.removeAttribute('src'); d.has = false; d.file = null; d.pos.value = '';
    if (d.mock) d.mock.value = '';
    paint();
  }
  SIDES.forEach((side) => {
    const d = design[side];
    d.input.addEventListener('change', () => setFile(side, d.input.files[0]));
    ['dragenter', 'dragover'].forEach((ev) => d.drop.addEventListener(ev, (e) => { e.preventDefault(); d.drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((ev) => d.drop.addEventListener(ev, (e) => { e.preventDefault(); d.drop.classList.remove('is-over'); }));
    d.drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) { try { d.input.files = e.dataTransfer.files; } catch {} setFile(side, f); } });
    q(`[data-cz-remove="${side}"]`).addEventListener('click', () => clearFile(side));
    q(`[data-cz-edit="${side}"]`).addEventListener('click', () => { setSide(side); canvas.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  });
  empty.addEventListener('click', () => cur().input.click());
  canvas.addEventListener('dragover', (e) => { e.preventDefault(); canvas.classList.add('is-over'); });
  canvas.addEventListener('dragleave', () => canvas.classList.remove('is-over'));
  canvas.addEventListener('drop', (e) => { e.preventDefault(); canvas.classList.remove('is-over'); const f = e.dataTransfer.files[0]; if (f) { try { cur().input.files = e.dataTransfer.files; } catch {} setFile(state.side, f); } });

  /* ---- Gestures: drag to move, knobs to scale / rotate ---- */
  let gesture = null, pinch = null;
  const stageRect = () => garment.getBoundingClientRect();
  const angleTo = (e, r, d) => Math.atan2(e.clientY - (r.top + r.height * d.y / 100), e.clientX - (r.left + r.width * d.x / 100)) * 180 / Math.PI;
  const distTo = (e, r, d) => Math.hypot(e.clientX - (r.left + r.width * d.x / 100), e.clientY - (r.top + r.height * d.y / 100));
  const norm = (deg) => ((deg + 180) % 360 + 360) % 360 - 180;

  SIDES.forEach((side) => {
    const d = design[side]; const el = d.el;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const knob = e.target.closest('[data-cz-knob]');
      const r = stageRect();
      gesture = knob
        ? { kind: knob.dataset.czKnob, r, s0: d.s, r0: d.r, a0: angleTo(e, r, d), d0: distTo(e, r, d) }
        : { kind: 'move', r, ox: e.clientX, oy: e.clientY, sx: d.x, sy: d.y };
      el.classList.add('is-dragging'); el.setPointerCapture(e.pointerId); e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (!gesture) return;
      const g = gesture;
      if (g.kind === 'move') { d.x = g.sx + (e.clientX - g.ox) / g.r.width * 100; d.y = g.sy + (e.clientY - g.oy) / g.r.height * 100; }
      else if (g.kind === 'scale') d.s = Math.max(SCALE_MIN, Math.min(SCALE_MAX, g.s0 * (distTo(e, g.r, d) / Math.max(1, g.d0))));
      else if (g.kind === 'rotate') { let r = g.r0 + (angleTo(e, g.r, d) - g.a0); if (e.shiftKey) r = Math.round(r / 15) * 15; d.r = norm(r); }
      paint();
    });
    ['pointerup', 'pointercancel'].forEach((ev) => el.addEventListener(ev, () => { gesture = null; el.classList.remove('is-dragging'); }));
    el.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 5 : 1; let used = true;
      switch (e.key) {
        case 'ArrowLeft': d.x -= step; break;
        case 'ArrowRight': d.x += step; break;
        case 'ArrowUp': d.y -= step; break;
        case 'ArrowDown': d.y += step; break;
        case '+': case '=': d.s = Math.min(SCALE_MAX, d.s + step * 2); break;
        case '-': case '_': d.s = Math.max(SCALE_MIN, d.s - step * 2); break;
        case '[': d.r = norm(d.r - step * 3); break;
        case ']': d.r = norm(d.r + step * 3); break;
        case 'Delete': case 'Backspace': clearFile(side); break;
        default: used = false;
      }
      if (used) { e.preventDefault(); paint(); }
    });
  });
  canvas.addEventListener('wheel', (e) => {
    const d = cur(); if (!d.has) return; e.preventDefault();
    if (e.altKey || e.shiftKey) d.r = norm(d.r - Math.sign(e.deltaY) * 3);
    else d.s = Math.max(SCALE_MIN, Math.min(SCALE_MAX, d.s - Math.sign(e.deltaY) * 2));
    paint();
  }, { passive: false });
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) { const [a, b] = e.touches; const d = cur(); pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), ang: Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) * 180 / Math.PI, s: d.s, r: d.r }; gesture = null; }
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    if (!pinch || e.touches.length !== 2) return;
    const [a, b] = e.touches; const d = cur();
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const ang = Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) * 180 / Math.PI;
    d.s = Math.max(SCALE_MIN, Math.min(SCALE_MAX, pinch.s * dist / pinch.d));
    d.r = norm(pinch.r + (ang - pinch.ang));
    paint();
  }, { passive: true });
  canvas.addEventListener('touchend', () => { pinch = null; });
  scale && scale.addEventListener('input', () => { cur().s = Number(scale.value); paint(); });
  rotate && rotate.addEventListener('input', () => { cur().r = Number(rotate.value); paint(); });

  /* ---- Toolbar ---- */
  qa('[data-cz-tool]').forEach((b) => b.addEventListener('click', () => {
    const d = cur();
    switch (b.dataset.czTool) {
      case 'zoom-in': d.s = Math.min(SCALE_MAX, d.s + 4); break;
      case 'zoom-out': d.s = Math.max(SCALE_MIN, d.s - 4); break;
      case 'rotate-l': d.r = norm(d.r - 15); break;
      case 'rotate-r': d.r = norm(d.r + 15); break;
      case 'center': centerInArea(d); break;
      case 'reset': centerInArea(d); d.s = 42; d.r = 0; break;
      case 'fit': { const [, , w, h] = printArea(); centerInArea(d); d.s = Math.min(SCALE_MAX, Math.min(w, h) * .92); d.r = 0; break; }
      case 'replace': d.input.click(); return;
      case 'remove': clearFile(state.side); return;
    }
    paint(); L.buzz();
  }));

  /* ---- Garment / colour ---- */
  qa('[data-cz-garment-opt]').forEach((btn) => btn.addEventListener('click', () => {
    qa('[data-cz-garment-opt]').forEach((b) => { b.classList.toggle('is-active', b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
    state.shape = btn.dataset.czGarmentOpt; state.label = btn.dataset.label || state.shape;
    garment.classList.remove('is-swap'); void garment.offsetWidth; garment.classList.add('is-swap');
    SIDES.forEach((s) => centerInArea(design[s], s));
    paint(); L.buzz();
  }));
  qa('[data-cz-color]').forEach((btn) => btn.addEventListener('click', () => {
    qa('[data-cz-color]').forEach((b) => { b.classList.toggle('is-active', b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
    state.colorKey = btn.dataset.czColor; state.color = btn.dataset.czColorName || ''; state.colorValue = btn.dataset.czVariantValue || state.color; state.hex = btn.dataset.czHex || '#181818';
    garment.classList.remove('is-swap'); void garment.offsetWidth; garment.classList.add('is-swap');
    paint(); L.buzz();
  }));

  /* ---- Mockups: one composited JPEG per side that has a design ---- */
  function loadImg(src) { return new Promise((res) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }
  async function buildMockup(side) {
    const d = design[side];
    if (!d.has || !d.mock) return null;
    const photo = showLayer(side);
    const size = 1000;
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0b2a1c'; ctx.fillRect(0, 0, size, size);
    try {
      let base = null;
      if (photo) base = await loadImg(photo.currentSrc || photo.src);
      else {
        const svg = qa('[data-cz-mock]').find((m) => !m.hidden)?.querySelector('svg');
        if (svg) { const clone = svg.cloneNode(true); clone.querySelectorAll('[fill="var(--gc)"]').forEach((el) => el.setAttribute('fill', state.hex)); clone.setAttribute('width', size); clone.setAttribute('height', size); const u = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' })); base = await loadImg(u); URL.revokeObjectURL(u); }
      }
      if (base) ctx.drawImage(base, 0, 0, size, size);
      const dw = size * d.s / 100 * .66;
      const dh = dw * (d.img.naturalHeight / Math.max(1, d.img.naturalWidth));
      ctx.save(); ctx.translate(size * d.x / 100, size * d.y / 100); ctx.rotate(d.r * Math.PI / 180);
      ctx.drawImage(d.img, -dw / 2, -dh / 2, dw, dh); ctx.restore();
      ctx.fillStyle = 'rgba(244,232,216,.9)'; ctx.font = `500 24px ${getComputedStyle(document.body).fontFamily}`;
      ctx.fillText(`${state.label} · ${state.color} · ${sideName(side)} · ${state.method} · ×${state.qty} · ${d.pos.value}`, 24, size - 28);
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', .85));
      if (!blob) return null;
      const file = new File([blob], `mockup-${state.shape}-${side}-${Date.now()}.jpg`, { type: 'image/jpeg' });
      try { const dt = new DataTransfer(); dt.items.add(file); d.mock.files = dt.files; } catch { return null; }
      return file;
    } catch (e) { console.warn('[customize] mockup failed', e); return null; }
    finally { showLayer(); }
  }

  /* ---- Submit guard: at least one design + embroidery minimum, then attach mockups ---- */
  let mockupsReady = false;
  form.addEventListener('submit', (e) => {
    let msg = '';
    const any = SIDES.some((s) => design[s].has);
    if (!any) msg = strings.needDesign;
    else if (state.method === 'Embroidery' && state.qty < MIN_EMB) msg = strings.minEmbroidery;
    if (msg) { e.preventDefault(); e.stopImmediatePropagation(); submitErr.textContent = msg; submitErr.hidden = false; (any ? minNotice : q('[data-cz-upload]')).scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    submitErr.hidden = true;
    if (!mockupsReady) {
      e.preventDefault(); e.stopImmediatePropagation();
      const btn = q('[data-cz-submit]'); btn && btn.classList.add('is-loading');
      Promise.all(SIDES.map(buildMockup)).then(() => { mockupsReady = true; form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }).finally(() => setTimeout(() => { mockupsReady = false; }, 0));
    }
  }, true);

  renderSizes();
  SIDES.forEach((s) => centerInArea(design[s], s));
  paint();
})();
