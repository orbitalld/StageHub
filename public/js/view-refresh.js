// Actualización de vistas: preparar fuera del DOM y conservar el contexto visual.
export function captureView(root) {
  const expanded = new Map(Array.from(root.querySelectorAll('details[data-refresh-key]'), el => [el.dataset.refreshKey, el.open]));
  const controls = new Map(Array.from(root.querySelectorAll('[data-refresh-control]'), el => [el.dataset.refreshControl, el.value]));
  return { expanded, controls };
}
export function restoreView(root, snapshot) {
  for (const el of root.querySelectorAll('details[data-refresh-key]')) {
    if (snapshot.expanded.has(el.dataset.refreshKey)) el.open = snapshot.expanded.get(el.dataset.refreshKey);
  }
  for (const el of root.querySelectorAll('[data-refresh-control]')) {
    const value = snapshot.controls.get(el.dataset.refreshControl);
    if (value === undefined) continue;
    if (el.tagName === 'SELECT' && !Array.from(el.options).some(o => o.value === value)) continue;
    if (el.value !== value) { el.value = value; el.dispatchEvent(new Event('input')); }
  }
}
export function commitView(host, next, preserve, viewport = window) {
  // Leer el scroll al momento del cambio, no antes de la petición de red.
  const scroll = preserve ? { x: viewport.scrollX, y: viewport.scrollY } : { x: 0, y: 0 };
  if (preserve) restoreView(next, captureView(host));
  host.replaceChildren(next);
  viewport.scrollTo({ left: scroll.x, top: scroll.y, behavior: 'instant' });
}
