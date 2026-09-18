/* LINUX — collection: filter drawer submit + AJAX grid refresh via Section Rendering API */
(function () {
  'use strict';
  const L = window.LINUX;
  const form = document.querySelector('[data-filter-form]');
  const apply = document.querySelector('[data-filter-apply]');
  const grid = document.querySelector('[data-collection-grid]');
  const count = document.querySelector('[data-collection-count]');
  const badge = document.querySelector('[data-filter-count]');
  if (!form) return;

  function paintBadge() {
    const n = Array.from(new FormData(form).entries()).filter(([k, v]) => v && k !== 'sort_by').length;
    if (badge) { badge.textContent = n; badge.hidden = n === 0; }
  }
  paintBadge();

  async function submit() {
    const fd = new FormData(form);
    const params = new URLSearchParams();
    for (const [k, v] of fd.entries()) if (v !== '') params.append(k, v);
    const url = `${form.getAttribute('action')}${params.toString() ? '?' + params : ''}`;
    if (!grid) { location.href = url; return; }
    grid.style.opacity = '.4';
    try {
      const sectionId = document.querySelector('[data-collection]').id.replace('collection-', '');
      const fresh = await L.renderSection(sectionId, url);
      const freshGrid = fresh.querySelector('[data-collection-grid]');
      const freshCount = fresh.querySelector('[data-collection-count]');
      const freshEmpty = fresh.querySelector('.empty-state');
      const freshPag = fresh.querySelector('.pagination');
      if (freshGrid) grid.innerHTML = freshGrid.innerHTML; else if (freshEmpty) grid.innerHTML = `<div style="grid-column:1/-1">${freshEmpty.outerHTML}</div>`;
      if (count && freshCount) count.textContent = freshCount.textContent;
      const oldPag = document.querySelector('.pagination'); if (oldPag) oldPag.remove();
      if (freshPag) grid.insertAdjacentElement('afterend', freshPag);
      history.replaceState({}, '', url);
      L.drawers && L.drawers.close();
    } catch { location.href = url; }
    grid.style.opacity = '';
    paintBadge();
  }
  apply && apply.addEventListener('click', (e) => { e.preventDefault(); submit(); });
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  form.addEventListener('change', L.debounce(() => { paintBadge(); if (matchMedia('(min-width: 900px)').matches) submit(); }, 350));
})();
