import { get, del } from '../api.js?v=0.5.2';
import { can, state, companyName } from '../state.js?v=0.5.2';
import {appendSafe, replaceSafe,  h, icon, badge, fmtNum, MODE_LABEL, STOCK_STATUS, toast, confirmDialog, debounce, clear } from '../ui.js?v=0.5.2';
import { openItemForm } from './item-form.js?v=0.5.2';

import { copyItemInformation } from '../item-summary.js?v=0.5.2';

const SORTABLE = { name: 'Equipo', code: 'Código', category: 'Categoría', total: 'Total', available: 'Disp.' };

export default async function inventoryPage(el) {
  const catalog = await get('/api/categories');
  const q = { search: '', category_id: '', subcategory_id: '', status: '', mode: '', sort: 'name', dir: 'asc', page: 1, limit: 25 };
  try { Object.assign(q, JSON.parse(sessionStorage.getItem(`inv-filters-${state.companyId}`) || '{}')); } catch { /* sin filtros guardados */ }
  const canWrite = can('inventory:write');

  const results = h('div', {});
  const search = h('input', { type: 'search', placeholder: 'Buscar equipo, código, serie o N.º…', value: q.search,
    oninput: debounce((e) => { q.search = e.target.value; q.page = 1; load(); }) });
  const sel = (key, options, onchange) => {
    const s = h('select', { onchange: (e) => { q[key] = e.target.value; q.page = 1; onchange?.(); load(); } }, options.map(([v, t]) => h('option', { value: v }, t)));
    s.value = q[key]; return s;
  };
  const catSel = sel('category_id', [['', 'Todas las categorías'], ...catalog.map((c) => [c.id, c.name])], () => { q.subcategory_id = ''; fillSubs(); });
  const subSel = h('select', { onchange: (e) => { q.subcategory_id = e.target.value; q.page = 1; load(); } });
  function fillSubs() {
    const c = catalog.find((x) => String(x.id) === String(q.category_id));
    subSel.replaceChildren(h('option', { value: '' }, 'Todas las subcategorías'), ...(c?.subcategories ?? []).map((s) => h('option', { value: s.id }, s.name)));
    subSel.value = q.subcategory_id; subSel.disabled = !c;
  }
  fillSubs();
  const statusSel = sel('status', [['', 'Todos los estados'], ['disponible', 'Con disponibles'], ['mantenimiento', 'Con unidades en mantenimiento'], ['fuera_de_servicio', 'Con unidades fuera de servicio'], ['bajo_stock', 'Stock insuficiente'], ['sin_stock', 'Sin existencias']]);
  const modeSel = sel('mode', [['', 'Ambas modalidades'], ['individual', 'Individual'], ['cantidad', 'Por cantidad']]);

  appendSafe(el,
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Inventario'), h('div', { class: 'sub' }, `Equipos y materiales · ${companyName()}`)), h('div', { class: 'spacer' }),
      canWrite ? h('button', { class: 'btn primary', onclick: () => openItemForm({ onSaved: (it) => { location.hash = `#/inventory/${it.id}`; } }) }, icon('plus'), 'Nuevo equipo') : null),
    h('div', { class: 'toolbar' }, h('div', { class: 'search' }, icon('search'), search), catSel, subSel, statusSel, modeSel),
    results);

  let loadSequence = 0, hasData = false;
  async function load() {
    const mine = ++loadSequence;
    sessionStorage.setItem(`inv-filters-${state.companyId}`, JSON.stringify(q));
    const params = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '' && v != null));
    let data;
    try { data = await get(`/api/items?${params}`); } catch (e) { if (mine !== loadSequence) return; if (!hasData) throw e; toast(e.message, 'error'); return; }
    if (mine !== loadSequence) return;
    render(data); hasData = true;
  }

  function sortHead(key) {
    const active = q.sort === key;
    return h('th', { class: `sortable ${['total', 'available'].includes(key) ? 'num' : ''}`, onclick: () => { q.dir = active && q.dir === 'asc' ? 'desc' : 'asc'; q.sort = key; q.page = 1; load(); } },
      SORTABLE[key], active ? (q.dir === 'asc' ? ' ▲' : ' ▼') : '');
  }

  async function remove(item) {
    const detail = item.tracking_mode === 'individual' ? `Se eliminarán también sus ${item.stock.total} unidad(es) con su historial.` : 'Se eliminarán sus existencias.';
    if (!(await confirmDialog({ title: 'Eliminar equipo', message: `¿Eliminar "${item.name}" (${item.internal_code})? ${detail} Esta acción no se puede deshacer.`, confirmText: 'Eliminar', danger: true }))) return;
    try { await del(`/api/items/${item.id}`); toast('Equipo eliminado'); load(); } catch (e) { toast(e.message, 'error'); }
  }

  function render({ items, total, page, limit }) {
    const pages = Math.max(1, Math.ceil(total / limit));
    if (!items.length) {
      replaceSafe(results,h('div', { class: 'card empty' }, h('h2', {}, total === 0 && !q.search && !q.category_id && !q.status && !q.mode ? 'Todavía no hay equipos' : 'Sin resultados'),
        h('p', {}, 'Ajusta los filtros o registra un equipo nuevo.')));
      return;
    }
    const rows = items.map((it) => {
      const [stLabel, stKind] = STOCK_STATUS[it.stock.status];
      return h('tr', { class: 'click', onclick: (e) => { if (!e.target.closest('button,a')) location.hash = `#/inventory/${it.id}`; } },
        h('td', { class: 'nolabel' }, h('div', { class: 'row' },
          it.photo ? h('img', { class: 'thumb', src: `/uploads/${it.photo}`, alt: '', loading: 'lazy' }) : h('div', { class: 'thumb' }, icon('image')),
          h('div', {}, h('div', { class: 'item-name' }, it.name), h('div', { class: 'muted small' }, [it.brand, it.model].filter(Boolean).join(' · ') || '—')))),
        h('td', { 'data-label': 'Código' }, h('span', { class: 'mono' }, it.internal_code)),
        h('td', { 'data-label': 'Categoría' }, h('span', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'dot', style: { background: it.category.color } }),
          it.subcategory ? `${it.category.name} › ${it.subcategory.name}` : it.category.name)),
        h('td', { 'data-label': 'Modalidad' }, badge(MODE_LABEL[it.tracking_mode], 'info')),
        h('td', { class: 'num', 'data-label': 'Total' }, fmtNum(it.stock.total)),
        h('td', { class: 'num', 'data-label': 'Disponibles' }, fmtNum(it.stock.available), it.low_stock ? h('span', { title: `Por debajo del mínimo (${it.min_stock})`, style: { color: 'var(--warn)', marginLeft: '6px' } }, icon('alert', 14)) : null),
        h('td', { 'data-label': 'Estado' }, badge(stLabel, stKind)),
        h('td', { class: 'actions-cell' }, h('div', { class: 'actions' },
          canWrite ? [
            h('button', { class: 'icon-btn', title: 'Editar', 'aria-label': 'Editar', onclick: async () => openItemForm({ item: await get(`/api/items/${it.id}`), onSaved: load }) }, icon('edit')),
            h('button', { class: 'icon-btn danger', title: 'Eliminar', 'aria-label': 'Eliminar', onclick: () => remove(it) }, icon('trash')),
          ] : null,
          h('button', { class: 'btn', type: 'button', title: 'Copiar información', 'aria-label': 'Copiar información', onclick: e => copyItemInformation(it.id, e.currentTarget) }, icon('copy'), 'Copiar información'))));
    });
    replaceSafe(results,
      h('div', { class: 'table-wrap' }, h('table', { class: 'responsive' },
        h('thead', {}, h('tr', {}, sortHead('name'), sortHead('code'), sortHead('category'), h('th', {}, 'Modalidad'), sortHead('total'), sortHead('available'), h('th', {}, 'Estado'), h('th', {}))),
        h('tbody', {}, rows))),
      h('div', { class: 'pager' }, h('span', {}, `${fmtNum(total)} equipo(s) · página ${page} de ${pages}`),
        h('button', { class: 'icon-btn', disabled: page <= 1, 'aria-label': 'Anterior', onclick: () => { q.page = page - 1; load(); } }, icon('prev')),
        h('button', { class: 'icon-btn', disabled: page >= pages, 'aria-label': 'Siguiente', onclick: () => { q.page = page + 1; load(); } }, icon('next'))));
  }
  await load();
}
