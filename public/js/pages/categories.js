import { get, post, put, del } from '../api.js?v=0.4.5';
import { can } from '../state.js?v=0.4.5';
import { h, icon, badge, field, modal, guarded, toast, confirmDialog, MODE_LABEL, clear } from '../ui.js?v=0.4.5';

export default async function categoriesPage(el) {
  const canWrite = can('categories:write');
  const host = h('div', { class: 'stack' });
  el.append(
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Categorías'), h('div', { class: 'sub' }, 'Catálogo compartido por todas las empresas · cantidades de referencias de la empresa activa')), h('div', { class: 'spacer' }),
      canWrite ? h('button', { class: 'btn primary', onclick: () => categoryDialog() }, icon('plus'), 'Nueva categoría') : null), host);
  await refresh();

  async function refresh() {
    const cats = await get('/api/categories');
    clear(host);
    if (!cats.length) host.append(h('div', { class: 'card empty' }, 'No hay categorías. Crea la primera para poder registrar equipos.'));
    for (const c of cats) host.append(h('div', { class: 'card' },
      h('div', { class: 'row wrap', style: { marginBottom: '12px' } },
        h('span', { class: 'dot', style: { background: c.color, width: '12px', height: '12px' } }), h('h2', { style: { margin: 0, fontSize: '16px' } }, c.name),
        badge(`Por defecto: ${MODE_LABEL[c.tracking_mode]}`), h('span', { class: 'muted small' }, `${c.item_count} equipo(s)`), h('div', { class: 'spacer' }),
        canWrite ? [
          h('button', { class: 'btn', onclick: () => subDialog(c) }, icon('plus'), 'Subcategoría'),
          h('button', { class: 'icon-btn', title: 'Editar', 'aria-label': 'Editar categoría', onclick: () => categoryDialog(c) }, icon('edit')),
          h('button', { class: 'icon-btn danger', title: 'Eliminar', 'aria-label': 'Eliminar categoría', onclick: () => removeCat(c) }, icon('trash'))] : null),
      c.subcategories.length ? h('div', { class: 'chips' }, c.subcategories.map((s) => h('span', { class: 'chip', title: `${MODE_LABEL[s.tracking_mode]} · ${s.item_count} equipo(s)` },
        s.name, h('span', { class: 'muted small', style: { margin: '0 2px' } }, s.tracking_mode === 'individual' ? 'ind.' : 'cant.'),
        canWrite ? [h('button', { 'aria-label': `Editar ${s.name}`, onclick: () => subDialog(c, s) }, icon('edit', 13)), h('button', { 'aria-label': `Eliminar ${s.name}`, onclick: () => removeSub(s) }, icon('x', 13))] : null)))
        : h('p', { class: 'muted', style: { margin: 0 } }, 'Sin subcategorías.')));
  }

  function categoryDialog(c = null) {
    const err = h('div', { class: 'error-box', hidden: true });
    const name = h('input', { type: 'text', value: c?.name ?? '', maxlength: 60, required: true });
    const color = h('input', { type: 'color', value: c?.color ?? '#5b8cff' });
    const mode = modeSelect(c?.tracking_mode ?? 'individual');
    const save = h('button', { class: 'btn primary', type: 'submit', form: 'catform' }, 'Guardar');
    const m = modal({ title: c ? 'Editar categoría' : 'Nueva categoría',
      body: h('form', { id: 'catform', class: 'stack', onsubmit: (e) => { e.preventDefault();
        guarded(save, err, async () => {
          const body = { name: name.value, color: color.value, tracking_mode: mode.value };
          await (c ? put(`/api/categories/${c.id}`, body) : post('/api/categories', body));
          m.close(); toast('Categoría guardada'); refresh();
        }); } },
      err, field('Nombre', name), field('Color', color), field('Modalidad por defecto', mode, 'Se propone al crear equipos; se puede cambiar en cada subcategoría y en cada equipo.')),
      footer: [h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cancelar'), save] });
  }

  function subDialog(cat, s = null) {
    const err = h('div', { class: 'error-box', hidden: true });
    const name = h('input', { type: 'text', value: s?.name ?? '', maxlength: 80, required: true });
    const mode = modeSelect(s?.tracking_mode ?? cat.tracking_mode);
    const tpl = h('textarea', { rows: 4, placeholder: 'Ancho (m)\nLargo (m)', value: (s?.spec_template ?? []).join('\n') });
    const save = h('button', { class: 'btn primary', type: 'submit', form: 'subform' }, 'Guardar');
    const m = modal({ title: s ? `Editar subcategoría` : `Nueva subcategoría en ${cat.name}`,
      body: h('form', { id: 'subform', class: 'stack', onsubmit: (e) => { e.preventDefault();
        guarded(save, err, async () => {
          const body = { name: name.value, tracking_mode: mode.value, spec_template: tpl.value.split('\n').map((x) => x.trim()).filter(Boolean) };
          await (s ? put(`/api/subcategories/${s.id}`, body) : post(`/api/categories/${cat.id}/subcategories`, body));
          m.close(); toast('Subcategoría guardada'); refresh();
        }); } },
      err, field('Nombre', name), field('Modalidad de inventario', mode),
      field('Características sugeridas (una por línea)', tpl, 'Aparecerán precargadas al crear un equipo de esta subcategoría. Útil para medidas como ancho y largo de tarimas.')),
      footer: [h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cancelar'), save] });
  }

  function modeSelect(value) {
    const s = h('select', {}, h('option', { value: 'individual' }, 'Individual (serie, QR y mantenimiento por unidad)'), h('option', { value: 'cantidad' }, 'Por cantidad'));
    s.value = value; return s;
  }

  async function removeCat(c) {
    if (!(await confirmDialog({ title: 'Eliminar categoría', message: `¿Eliminar "${c.name}" y sus ${c.subcategories.length} subcategoría(s)? Solo es posible si no tiene equipos.`, confirmText: 'Eliminar', danger: true }))) return;
    try { await del(`/api/categories/${c.id}`); toast('Categoría eliminada'); refresh(); } catch (e) { toast(e.message, 'error'); }
  }
  async function removeSub(s) {
    if (!(await confirmDialog({ title: 'Eliminar subcategoría', message: `¿Eliminar "${s.name}"?`, confirmText: 'Eliminar', danger: true }))) return;
    try { await del(`/api/subcategories/${s.id}`); toast('Subcategoría eliminada'); refresh(); } catch (e) { toast(e.message, 'error'); }
  }
}
