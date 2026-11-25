import { get, post, put, del } from '../api.js?v=0.4.7';
import { can, state, companyName, selectCompany } from '../state.js?v=0.4.7';
import { h, icon, badge, field, modal, guarded, toast, confirmDialog, fmtNum, fmtMoney, fmtDate, fmtDateTime, MODE_LABEL, STOCK_STATUS, UNIT_STATUS, clear } from '../ui.js?v=0.4.7';
import { openItemForm } from './item-form.js?v=0.4.7';

import { copyItemInformation } from '../item-summary.js?v=0.4.7';

export default async function itemPage(el, [idStr]) {
  const id = Number(idStr);
  const canWrite = can('inventory:write');
  const host = h('div', {});
  el.append(host);
  await refresh();

  async function refresh(item) {
    item = item ?? await get(`/api/items/${id}`);
    const history = await get(`/api/items/${id}/history`).catch(() => []);
    draw(item, history);
  }

  function draw(item, history) {
    const s = item.stock;
    const [stLabel, stKind] = STOCK_STATUS[s.status];
    const stat = (label, value, cls = '') => h('div', { class: `kpi ${cls}` }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, fmtNum(value)));
    clear(host).append(h('div', {},
      h('a', { href: '#/inventory', class: 'btn ghost', style: { marginBottom: '10px' } }, icon('back'), 'Inventario'),
      h('div', { class: 'card' }, h('div', { class: 'detail-head' },
        item.photo ? h('img', { class: 'detail-photo', src: `/uploads/${item.photo}`, alt: item.name }) : h('div', { class: 'detail-photo' }, icon('image', 28)),
        h('div', { style: { flex: 1, minWidth: '220px' } },
          h('h1', {}, item.name), h('div',{class:'muted small'},`Empresa: ${companyName()}`),
          h('div', { class: 'row wrap', style: { marginTop: '8px' } }, h('span', { class: 'mono muted' }, item.internal_code),
            h('span', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'dot', style: { background: item.category.color } }), item.subcategory ? `${item.category.name} › ${item.subcategory.name}` : item.category.name),
            badge(MODE_LABEL[item.tracking_mode], 'info'), badge(stLabel, stKind), item.low_stock ? badge(`Bajo el mínimo (${item.min_stock})`, 'warn') : null)),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn', type: 'button', onclick: e => copyItemInformation(id, e.currentTarget) }, icon('copy'), 'Copiar información'),
          canWrite ? [
          h('button', { class: 'btn', onclick: () => openItemForm({ item, onSaved: (it) => refresh(it) }) }, icon('edit'), 'Editar'),
          can('companies:write') && state.companies.length>1 ? h('button',{class:'btn',onclick:()=>transferDialog(item)},'Trasladar') : null,
          h('button', { class: 'btn danger', onclick: async () => {
            if (!(await confirmDialog({ title: 'Eliminar equipo', message: `¿Eliminar "${item.name}" y todas sus existencias? No se puede deshacer.`, confirmText: 'Eliminar', danger: true }))) return;
            try { await del(`/api/items/${id}`); toast('Equipo eliminado'); location.hash = '#/inventory'; } catch (e) { toast(e.message, 'error'); }
          } }, icon('trash'), 'Eliminar')] : null))),
      h('div', { style: { height: '14px' } }),
      h('div', { class: 'grid kpis' }, stat('Total', s.total), stat('Disponibles', s.available, 'ok'), stat('En mantenimiento', s.maintenance, s.maintenance ? 'warn' : ''), stat('Fuera de servicio', s.out_of_service, s.out_of_service ? 'bad' : '')),
      h('div', { style: { height: '14px' } }),
      h('div', { class: 'card' }, h('h2', {}, 'Información'), h('dl', { class: 'dl' },
        ...[['Marca', item.brand], ['Modelo', item.model], ['Ubicación', item.location], ['Proveedor', item.supplier], ['Fecha de adquisición', item.acquisition_date ? fmtDate(item.acquisition_date) : null],
          ['Precio de adquisición', item.acquisition_price != null ? fmtMoney(item.acquisition_price) : null], ['Actualizado', fmtDateTime(item.updated_at)]]
          .map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v || '—'))))),
      item.description || item.notes ? [h('div', { style: { height: '14px' } }), h('div', { class: 'card stack' },
        item.description ? h('div', {}, h('h2', {}, 'Descripción'), h('div', { style: { whiteSpace: 'pre-wrap' } }, item.description)) : null,
        item.notes ? h('div', {}, h('h2', {}, 'Observaciones'), h('div', { style: { whiteSpace: 'pre-wrap' } }, item.notes)) : null)] : null,
      item.specs.length || item.accessories.length ? [h('div', { style: { height: '14px' } }), h('div', { class: 'grid cols-2' },
        h('div', { class: 'card' }, h('h2', {}, 'Características técnicas'), item.specs.length ? h('dl', { class: 'dl' }, item.specs.map((x) => h('div', {}, h('dt', {}, x.key), h('dd', {}, x.value || '—')))) : h('p', { class: 'muted', style: { margin: 0 } }, 'Sin características registradas.')),
        h('div', { class: 'card' }, h('h2', {}, 'Accesorios incluidos'), item.accessories.length ? h('ul', { class: 'list' }, item.accessories.map((a) => h('li', {}, a))) : h('p', { class: 'muted', style: { margin: 0 } }, 'Sin accesorios registrados.')))] : null,
      h('div', { style: { height: '14px' } }),
      item.tracking_mode === 'individual' ? unitsCard(item) : h('div', { class: 'card stack' }, h('h2', { style: { margin: 0 } }, 'Existencias por cantidad'),
        h('p', { class: 'muted', style: { margin: 0 } }, `Este equipo se administra por cantidad. Disponibles = ${s.total} − ${s.maintenance} en mantenimiento − ${s.out_of_service} fuera de servicio. ${canWrite ? 'Usa "Editar" para ajustar las cantidades y sus notas.' : ''}`),
        item.maintenance_note ? h('div', {}, badge(`${s.maintenance} en mantenimiento`, 'warn'), h('div', { class: 'status-note' }, item.maintenance_note)) : null,
        item.out_of_service_note ? h('div', {}, badge(`${s.out_of_service} fuera de servicio`, 'bad'), h('div', { class: 'status-note' }, item.out_of_service_note)) : null),
      h('div', { style: { height: '14px' } }),
      h('div', { class: 'card' }, h('h2', {}, 'Historial de cambios'),
        history.length ? h('ul', { class: 'list' }, history.map((r) => h('li', {}, h('span', { style: { flex: 1 } }, r.summary), h('span', { class: 'muted small' }, `${r.username ?? '—'} · ${fmtDateTime(r.ts)}`)))) : h('p', { class: 'muted', style: { margin: 0 } }, 'Sin movimientos.'))));
  }

  function transferDialog(item) {
    const choices=state.companies.filter(c=>c.id!==state.companyId);
    const target=h('select',{required:true},choices.map(c=>h('option',{value:c.id},c.name)));
    const err=h('div',{class:'error-box',hidden:true});
    const save=h('button',{class:'btn primary',type:'submit',form:'transfer-form'},'Trasladar equipo');
    const m=modal({title:'Trasladar equipo a otra empresa',body:h('form',{id:'transfer-form',class:'stack',onsubmit:e=>{
      e.preventDefault(); guarded(save,err,async()=>{await post(`/api/items/${id}/transfer`,{company_id:Number(target.value)});m.close();selectCompany(Number(target.value),`#/inventory/${id}`);});
    }},err,h('p',{},`Se trasladará ${item.name} completo, incluidas sus unidades, existencias, fotografía e historial.`),field('Empresa de destino',target)),footer:[h('button',{class:'btn',onclick:()=>m.close()},'Cancelar'),save]});
  }

  function unitsCard(item) {
    const units = item.units;
    return h('div', { class: 'card' },
      h('div', { class: 'row', style: { marginBottom: '12px' } }, h('h2', { style: { margin: 0 } }, `Unidades (${units.length})`), h('div', { class: 'spacer' }),
        canWrite ? h('button', { class: 'btn primary', onclick: () => addUnitsDialog(item) }, icon('plus'), 'Agregar unidades') : null),
      units.length ? h('div', { class: 'table-wrap', style: { border: 0 } }, h('table', { class: 'responsive' },
        h('thead', {}, h('tr', {}, h('th', {}, 'N.º'), h('th', {}, 'Código'), h('th', {}, 'N.º de serie'), h('th', {}, 'Estado'), h('th', {}, 'Ubicación'), h('th', {}, 'Observaciones'), h('th', {}))),
        h('tbody', {}, units.map((u) => {
          const [l, k] = UNIT_STATUS[u.status];
          return h('tr', {},
            h('td', { 'data-label': 'N.º' }, h('span', { class: 'unit-num' }, `#${u.unit_number ?? '—'}`)),
            h('td', { class: 'hide-sm', 'data-label': 'Código' }, h('span', { class: 'mono' }, u.unit_code)),
            h('td', { 'data-label': 'N.º de serie' }, u.serial_number || h('span', { class: 'muted' }, 'sin registrar')),
            h('td', { 'data-label': 'Estado' }, h('div', {}, badge(l, k),
              u.status !== 'disponible' ? h('div', { class: 'status-note' }, u.status_note || h('span', { class: 'muted' }, 'Sin nota'),
                u.status_changed_at ? h('div', { class: 'muted small' }, `${u.status_changed_by ?? ''} · ${fmtDateTime(u.status_changed_at)}`) : null) : null)),
            h('td', { class: 'hide-sm', 'data-label': 'Ubicación' }, u.location || '—'),
            h('td', { class: 'hide-sm', 'data-label': 'Observaciones' }, u.notes || '—'),
            h('td', { class: 'actions-cell' }, canWrite ? h('div', { class: 'actions' },
              h('button', { class: 'icon-btn', title: 'Editar unidad / cambiar estado', 'aria-label': 'Editar unidad', onclick: () => editUnitDialog(u) }, icon('edit')),
              h('button', { class: 'icon-btn danger', title: 'Eliminar unidad', 'aria-label': 'Eliminar unidad', onclick: () => removeUnit(u) }, icon('trash'))) : null));
        })))) : h('p', { class: 'muted', style: { margin: 0 } }, 'Este equipo no tiene unidades registradas.'));
  }

  function addUnitsDialog(item) {
    const err = h('div', { class: 'error-box', hidden: true });
    const count = h('input', { type: 'number', min: 1, max: 500, value: 1, inputmode: 'numeric' });
    const serials = h('textarea', { placeholder: 'SN-0001\nSN-0002\n…', rows: 5 });
    const start = h('input', { type: 'number', min: 1, max: 99999, inputmode: 'numeric', placeholder: 'Continúa desde el último' });
    const save = h('button', { class: 'btn primary', type: 'submit', form: 'addunits' }, 'Agregar');
    const m = modal({ title: 'Agregar unidades',
      body: h('form', { id: 'addunits', class: 'stack', onsubmit: (e) => { e.preventDefault();
        guarded(save, err, async () => {
          const list = serials.value.split('\n').map((x) => x.trim()).filter(Boolean);
          const payload = list.length ? { serials: list } : { count: Number(count.value) };
          if (start.value) payload.start_number = Number(start.value);
          const r = await post(`/api/items/${id}/units`, payload);
          m.close(); toast('Unidades agregadas'); refresh(r);
        }); } },
      err, field('Números de serie (uno por línea)', serials, 'Si los conoces, escríbelos aquí: se creará una unidad por línea.'),
      field('…o cantidad de unidades sin número de serie', count, 'Se ignora si escribes números de serie arriba.'),
      field('Numerar desde (opcional)', start, `Las máquinas se numeran solas siguiendo la última (hoy ${Math.max(0, ...item.units.map((x) => x.unit_number ?? 0))}). Escribe un número para empezar en otro.`)),
      footer: [h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cancelar'), save] });
  }

  function editUnitDialog(u) {
    const err = h('div', { class: 'error-box', hidden: true });
    const number = h('input', { type: 'number', min: 1, max: 99999, inputmode: 'numeric', value: u.unit_number ?? '', required: true });
    const serial = h('input', { type: 'text', value: u.serial_number ?? '', maxlength: 80 });
    const status = h('select', {}, Object.entries(UNIT_STATUS).map(([v, [t]]) => h('option', { value: v }, t)));
    status.value = u.status;
    const note = h('textarea', { value: u.status_note ?? '', maxlength: 500, rows: 3, placeholder: 'Ej. Lámpara quemada, enviar a servicio técnico; falla en motor de zoom…' });
    const noteField = field('Nota del estado (motivo, falla, repuesto pendiente…)', note, 'Queda guardada junto con quién y cuándo, y en el historial del equipo.');
    const syncNote = () => { noteField.hidden = status.value === 'disponible'; };
    status.addEventListener('change', () => { syncNote(); if (!noteField.hidden) note.focus(); });
    syncNote();
    const loc = h('input', { type: 'text', value: u.location ?? '', maxlength: 150 });
    const notes = h('textarea', { value: u.notes ?? '', maxlength: 1000 });
    const save = h('button', { class: 'btn primary', type: 'submit', form: 'editunit' }, 'Guardar');
    const m = modal({ title: `Máquina N.º ${u.unit_number ?? '—'} · ${u.unit_code}`,
      body: h('form', { id: 'editunit', class: 'stack', onsubmit: (e) => { e.preventDefault();
        guarded(save, err, async () => {
          const r = await put(`/api/units/${u.id}`, { unit_number: number.value, serial_number: serial.value, status: status.value, status_note: note.value, location: loc.value, notes: notes.value });
          m.close(); toast('Unidad actualizada'); refresh(r);
        }); } },
      err, h('div', { class: 'form-grid' }, field('N.º de la máquina', number), field('Número de serie', serial)),
      field('Estado', status), noteField, field('Ubicación', loc), field('Observaciones generales', notes)),
      footer: [h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cancelar'), save] });
  }

  async function removeUnit(u) {
    if (!(await confirmDialog({ title: 'Eliminar unidad', message: `¿Eliminar la máquina N.º ${u.unit_number ?? '—'} (${u.unit_code})${u.serial_number ? ` (serie ${u.serial_number})` : ''}?`, confirmText: 'Eliminar', danger: true }))) return;
    try { const r = await del(`/api/units/${u.id}`); toast('Unidad eliminada'); refresh(r); } catch (e) { toast(e.message, 'error'); }
  }
}
