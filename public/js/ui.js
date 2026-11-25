// Utilidades de interfaz: creación de DOM segura (sin innerHTML con datos), modales, avisos y formatos.
const ICONS = {
  dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  edit: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  menu: '<path d="M4 12h16"/><path d="M4 6h16"/><path d="M4 18h16"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  prev: '<path d="m15 18-6-6 6-6"/>', next: '<path d="m9 18 6-6-6-6"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
};

export function icon(name, size) {
  const s = document.createElement('span');
  s.className = 'icon';
  s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  if (size) { s.style.width = s.style.height = `${size}px`; }
  return s;
}

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  const deferred = [];
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') deferred.push([k, v]);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  for (const [k, v] of deferred) el[k] = v; // después de crear <option> para que select.value funcione
  return el;
}

export const clear = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };

// ---------- formatos ----------
const nf = new Intl.NumberFormat('es-CL');
export const fmtNum = (n) => nf.format(n ?? 0);
export const fmtMoney = (n) => (n == null ? '—' : `$ ${nf.format(n)}`);
export const fmtDate = (d) => (d ? d.split('-').reverse().join('-') : '—');
export function fmtDateTime(s) {
  if (!s) return '—';
  return new Date(s.replace(' ', 'T') + 'Z').toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
}
export const MODE_LABEL = { individual: 'Individual', cantidad: 'Por cantidad' };
export const UNIT_STATUS = {
  disponible: ['Disponible', 'ok'], mantenimiento: ['En mantenimiento', 'warn'], fuera_de_servicio: ['Fuera de servicio', 'bad'],
};
export const STOCK_STATUS = {
  disponible: ['Disponible', 'ok'], parcial: ['Parcial', 'warn'], no_disponible: ['No disponible', 'bad'], sin_stock: ['Sin existencias', ''],
};
export const badge = (text, kind = '') => h('span', { class: `badge ${kind}` }, text);

// ---------- avisos y diálogos ----------
let toastBox;
export function toast(message, type = 'ok') {
  if (!toastBox) { toastBox = h('div', { class: 'toasts', role: 'status' }); document.body.append(toastBox); }
  const t = h('div', { class: `toast ${type === 'error' ? 'error' : ''}` }, message);
  toastBox.append(t);
  setTimeout(() => t.remove(), type === 'error' ? 6000 : 3200);
}

export function modal({ title, body, footer, wide = false }) {
  const previousFocus = document.activeElement;
  const onKey = (e) => { if (e.key === 'Escape' && overlay === [...document.querySelectorAll('.overlay')].at(-1)) close(); };
  const box = h('div', { class: `modal ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('header', {}, h('h3', {}, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Cerrar', onclick: () => close() }, icon('x'))),
    h('div', { class: 'modal-body' }, body),
    footer ? h('footer', {}, footer) : null);
  const overlay = h('div', { class: 'overlay' }, box);
  document.body.append(overlay);
  document.body.classList.add('modal-open');
  document.addEventListener('keydown', onKey);
  const viewport = window.visualViewport;
  const mobile = window.matchMedia('(max-width: 860px), (pointer: coarse)');
  function syncViewport() {
    if (!viewport) return;
    overlay.style.setProperty('--dialog-height', `${viewport.height}px`);
    overlay.style.setProperty('--dialog-top', `${viewport.offsetTop}px`);
  }
  viewport?.addEventListener('resize', syncViewport);
  viewport?.addEventListener('scroll', syncViewport);
  syncViewport();
  function close() {
    if (!overlay.isConnected) return;
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    viewport?.removeEventListener('resize', syncViewport);
    viewport?.removeEventListener('scroll', syncViewport);
    if (!document.querySelector('.overlay')) document.body.classList.remove('modal-open');
    if (previousFocus?.isConnected && !mobile.matches) previousFocus.focus({ preventScroll: true });
  }
  // En móviles no abrir el teclado hasta que la persona toque un campo.
  if (!mobile.matches) requestAnimationFrame(() => {
    if (overlay.isConnected) box.querySelector('input:not([type=hidden]):not([type=file]), select, textarea')?.focus({ preventScroll: true });
  });
  return { close, el: box };
}

export function confirmDialog({ title, message, confirmText = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; m.close(); resolve(v); } };
    const m = modal({
      title, body: h('p', { style: { margin: 0 } }, message),
      footer: [h('button', { class: 'btn', onclick: () => finish(false) }, 'Cancelar'),
        h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => finish(true) }, confirmText)],
    });
    new MutationObserver((_, obs) => { if (!m.el.isConnected) { finish(false); obs.disconnect(); } }).observe(document.body, { childList: true });
  });
}

export const field = (label, input, hint) => h('div', { class: 'field' }, h('label', {}, label), input, hint ? h('div', { class: 'hint' }, hint) : null);

/** Ejecuta una acción mostrando el error del servidor en un cuadro; deshabilita el botón mientras trabaja. */
export async function guarded(button, errorBox, fn) {
  if (button.disabled) return;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  errorBox.hidden = true;
  try { return await fn(); }
  catch (e) { errorBox.textContent = e.message; errorBox.hidden = false; errorBox.scrollIntoView({ block: 'nearest' }); }
  finally { button.disabled = false; button.removeAttribute('aria-busy'); }
}

export function debounce(fn, ms = 300) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/** Reduce la foto en el navegador antes de subirla (los móviles producen archivos enormes). */
export function resizeImage(file, max = 1280) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen'))), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('El archivo no es una imagen válida')); };
    img.src = url;
  });
}
