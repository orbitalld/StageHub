// Ficha de inventario en texto plano. No contiene enlaces privados, credenciales ni tokens QR.
import { get } from './api.js?v=0.4.7';
import { h, modal, toast } from './ui.js?v=0.4.7';

const clean = value => value == null ? '' : String(value).trim().replace(/\s+/g, ' ');
const unitLabel = u => clean(u.unit_number) ? `N.º ${clean(u.unit_number)}` : clean(u.unit_code) || 'Unidad sin numerar';

export function formatItemSummary(item) {
  const s = item.stock;
  const individual = item.tracking_mode === 'individual';
  const units = individual && Array.isArray(item.units) ? item.units : [];
  const maintenance = units.filter(u => u.status === 'mantenimiento');
  const out = units.filter(u => u.status === 'fuera_de_servicio');
  const lines = [`Modelo de equipo: ${clean(item.model) || clean(item.name) || 'Sin modelo registrado'}`];
  const optional = (label, value) => { if (clean(value)) lines.push(`${label}: ${clean(value)}`); };
  if (clean(item.name) && clean(item.name) !== clean(item.model) && clean(item.model)) optional('Equipo', item.name);
  optional('Marca', item.brand);
  optional('Código', item.internal_code);
  optional('Categoría', [item.category?.name, item.subcategory?.name].map(clean).filter(Boolean).join(' / '));
  optional('Ubicación', item.location);
  lines.push('', 'Inventario:', `  • Cantidad total: ${s.total}`, `  • Disponibles: ${s.available}`, `  • En mantención: ${s.maintenance}`);
  for (const u of maintenance) lines.push(`      ◦ ${unitLabel(u)}`);
  lines.push(`  • Fuera de servicio: ${s.out_of_service}`);
  for (const u of out) lines.push(`      ◦ ${unitLabel(u)}`);
  const statusSection = (title, count, list, note) => {
    if (!(Number(count) > 0)) return;
    lines.push('', title + ':');
    if (individual) {
      for (const u of list) lines.push(`  • ${unitLabel(u)}: ${clean(u.status_note) || 'Sin nota registrada'}`);
      if (!list.length) lines.push('  • Sin detalle individual disponible');
    } else lines.push(`  • ${clean(note) || 'Sin nota registrada'}`);
  };
  statusSection('Estado de mantención', s.maintenance, maintenance, item.maintenance_note);
  statusSection('Estado fuera de servicio', s.out_of_service, out, item.out_of_service_note);
  const specs = (item.specs ?? []).filter(x => clean(x?.key) && clean(x?.value));
  if (specs.length) lines.push('', 'Características técnicas:', ...specs.map(x => `  • ${clean(x.key)}: ${clean(x.value)}`));
  const accessories = (item.accessories ?? []).map(clean).filter(Boolean);
  if (accessories.length) lines.push('', 'Accesorios:', ...accessories.map(x => `  • ${x}`));
  if (clean(item.description)) lines.push('', `Descripción: ${clean(item.description)}`);
  if (clean(item.notes)) lines.push('', `Observaciones: ${clean(item.notes)}`);
  return lines.join('\n');
}

export async function writeSummaryToClipboard(text) {
  if (!globalThis.navigator?.clipboard?.writeText) return false;
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

function showManualCopy(text) {
  const area = h('textarea', { readonly: true, rows: 14, value: text, 'aria-label': 'Ficha de inventario', style: { width: '100%', fontSize: '16px' } });
  const m = modal({ title: 'Copiar información', body: h('div', { class: 'stack' },
    h('p', { class: 'muted' }, 'Si el navegador bloquea la copia, mantén pulsado el texto y selecciona Copiar.'), area),
    footer: [h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cerrar'),
      h('button', { class: 'btn primary', type: 'button', onclick: async () => {
        if (await writeSummaryToClipboard(text)) { m.close(); toast('Información copiada'); }
        else { area.focus(); area.select(); area.setSelectionRange(0, text.length); toast('Texto seleccionado. Usa Copiar en tu dispositivo.'); }
      } }, 'Copiar información')] });
}

export async function copyItemInformation(id, button) {
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try {
    // Consultar el detalle actualizado, incluida la numeración y notas de cada unidad.
    const item = await get(`/api/items/${id}`);
    const text = formatItemSummary(item);
    if (await writeSummaryToClipboard(text)) toast('Información copiada');
    else showManualCopy(text);
  } catch (e) { toast(e.message || 'No se pudo obtener la información del equipo', 'error'); }
  finally { if (button) button.disabled = false; }
}
