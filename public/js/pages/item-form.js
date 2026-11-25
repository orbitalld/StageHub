import { companyName } from '../state.js?v=0.4.6';
// Formulario de alta/edición de equipos (modal). Toda validación definitiva ocurre en el backend.
import { get, post, put, api } from '../api.js?v=0.4.6';
import { h, icon, modal, field, guarded, toast, resizeImage, MODE_LABEL } from '../ui.js?v=0.4.6';

export async function openItemForm({ item = null, onSaved }) {
  const catalog = await get('/api/categories');
  const editing = !!item;
  const f = {
    name: item?.name ?? '', category_id: item?.category.id ?? catalog[0]?.id ?? null, subcategory_id: item?.subcategory?.id ?? null,
    tracking_mode: item?.tracking_mode ?? null, internal_code: item?.internal_code ?? '', brand: item?.brand ?? '', model: item?.model ?? '',
    location: item?.location ?? '', acquisition_date: item?.acquisition_date ?? '', acquisition_price: item?.acquisition_price ?? '',
    supplier: item?.supplier ?? '', description: item?.description ?? '', notes: item?.notes ?? '', min_stock: item?.min_stock ?? 0,
    qty_total: item?.tracking_mode === 'cantidad' ? item.stock.total : 0,
    qty_maintenance: item?.tracking_mode === 'cantidad' ? item.stock.maintenance : 0,
    qty_out_of_service: item?.tracking_mode === 'cantidad' ? item.stock.out_of_service : 0,
    initial_units: 1, photo: item?.photo ?? null,
    maintenance_note: item?.maintenance_note ?? '', out_of_service_note: item?.out_of_service_note ?? '',
  };
  let specs = (item?.specs ?? []).map((s) => ({ ...s }));
  let accessories = [...(item?.accessories ?? [])];
  const catOf = () => catalog.find((c) => c.id === Number(f.category_id));
  const subOf = () => catOf()?.subcategories.find((s) => s.id === Number(f.subcategory_id));
  const defaultMode = () => subOf()?.tracking_mode ?? catOf()?.tracking_mode ?? 'individual';
  if (!f.tracking_mode) f.tracking_mode = defaultMode();
  const hasStock = editing && item.stock.total > 0;

  const err = h('div', { class: 'error-box', hidden: true });
  const bind = (key, attrs = {}) => h('input', { type: 'text', value: f[key] ?? '', oninput: (e) => { f[key] = e.target.value; }, ...attrs });
  const bindNum = (key, attrs = {}) => h('input', { type: 'number', min: 0, step: 1, inputmode: 'numeric', value: f[key], oninput: (e) => { f[key] = e.target.value; }, ...attrs });
  const bindText = (key) => h('textarea', { oninput: (e) => { f[key] = e.target.value; }, value: f[key] ?? '' });

  // categoría / subcategoría
  const catSel = h('select', { onchange: (e) => { f.category_id = Number(e.target.value); f.subcategory_id = null; afterTaxonomy(); } },
    catalog.map((c) => h('option', { value: c.id }, c.name)));
  catSel.value = f.category_id;
  const subSel = h('select', { onchange: (e) => { f.subcategory_id = e.target.value ? Number(e.target.value) : null; afterTaxonomy(); } });
  function fillSubs() {
    subSel.replaceChildren(h('option', { value: '' }, '— Sin subcategoría —'), ...(catOf()?.subcategories ?? []).map((s) => h('option', { value: s.id }, s.name)));
    subSel.value = f.subcategory_id ?? '';
  }
  function afterTaxonomy() {
    fillSubs();
    if (!editing || !hasStock) { f.tracking_mode = defaultMode(); renderMode(); }
    const tpl = subOf()?.spec_template ?? [];
    if (!editing && tpl.length && specs.every((s) => !s.value)) { specs = tpl.map((k) => ({ key: k, value: '' })); renderSpecs(); }
  }

  // modalidad
  const modeBox = h('div', {}); const stockBox = h('div', { class: 'full' });
  function renderMode() {
    const radios = ['individual', 'cantidad'].map((m) => h('label', {},
      h('input', { type: 'radio', name: 'mode', value: m, checked: f.tracking_mode === m, disabled: hasStock, onchange: () => { f.tracking_mode = m; renderMode(); } }),
      h('span', {}, MODE_LABEL[m])));
    modeBox.replaceChildren(h('div', { class: 'seg' }, radios),
      h('div', { class: 'hint muted small', style: { marginTop: '5px' } }, hasStock
        ? 'No se puede cambiar la modalidad mientras existan unidades o cantidades.'
        : f.tracking_mode === 'individual' ? 'Cada unidad tiene su serie, QR, estado e historial propios.' : 'Se administra por cantidad total (cables, truss, accesorios).'));
    renderStock();
  }
  function renderStock() {
    const parts = [];
    if (f.tracking_mode === 'cantidad') {
      parts.push(h('div', { class: 'form-grid' },
        field('Cantidad total', bindNum('qty_total')), field('Mínimo requerido (alerta)', bindNum('min_stock')),
        field('En mantenimiento', bindNum('qty_maintenance')), field('Fuera de servicio', bindNum('qty_out_of_service')),
        field('Nota de mantenimiento', h('textarea', { rows: 2, maxlength: 500, placeholder: 'Qué pasa con las que están en mantenimiento', value: f.maintenance_note, oninput: (e) => { f.maintenance_note = e.target.value; } })),
        field('Nota de fuera de servicio', h('textarea', { rows: 2, maxlength: 500, placeholder: 'Por qué están fuera de servicio', value: f.out_of_service_note, oninput: (e) => { f.out_of_service_note = e.target.value; } })),
        h('div', { class: 'hint muted small full' }, 'Disponibles = total − mantenimiento − fuera de servicio. Las notas se guardan solo si hay cantidades en ese estado.')));
    } else {
      parts.push(h('div', { class: 'form-grid' },
        editing ? h('div', { class: 'field' }, h('label', {}, 'Unidades'), h('div', { class: 'muted' }, `${item.stock.total} registradas. Se administran desde la ficha del equipo.`))
          : field('Unidades a crear ahora', bindNum('initial_units', { max: 500 }), 'Se numeran solas desde el N.º 1 (editable después). Los números de serie se agregan luego.'),
        field('Mínimo requerido (alerta)', bindNum('min_stock'))));
    }
    stockBox.replaceChildren(...parts);
  }

  // foto
  const photoPrev = h('div', {});
  function renderPhoto() {
    photoPrev.replaceChildren(f.photo ? h('div', { class: 'row' }, h('img', { class: 'thumb', src: `/uploads/${f.photo}`, alt: '' }),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { f.photo = null; renderPhoto(); } }, icon('trash'), 'Quitar')) : h('div', { class: 'muted small' }, 'Sin fotografía'));
  }
  let uploading = false;
  const photoStatus = h('div', { class: 'muted small', role: 'status', hidden: true });
  const fileIn = h('input', { type: 'file', accept: 'image/*', onchange: async (e) => {
    const file = e.target.files[0]; if (!file || uploading || save.disabled) return;
    uploading = true; save.disabled = true; fileIn.disabled = true;
    photoStatus.textContent = 'Procesando y subiendo fotografía…'; photoStatus.hidden = false;
    try { const blob = await resizeImage(file); const r = await api('POST', '/api/uploads/photo', undefined, { raw: blob }); f.photo = r.photo; renderPhoto(); photoStatus.textContent = 'Fotografía lista.'; }
    catch (x) { photoStatus.textContent = `No se pudo subir la foto: ${x.message}. Puedes reintentar o guardar sin la nueva fotografía.`; }
    finally { uploading = false; save.disabled = false; fileIn.disabled = false; e.target.value = ''; }
  } });

  // características y accesorios
  const specBox = h('div', {}); const accBox = h('div', {});
  function renderSpecs() {
    specBox.replaceChildren(...specs.map((s, i) => h('div', { class: 'kv-row' },
      h('input', { type: 'text', placeholder: 'Característica', value: s.key, maxlength: 80, oninput: (e) => { s.key = e.target.value; } }),
      h('input', { type: 'text', placeholder: 'Valor', value: s.value, maxlength: 300, oninput: (e) => { s.value = e.target.value; } }),
      h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'Quitar', onclick: () => { specs.splice(i, 1); renderSpecs(); } }, icon('x')))),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { specs.push({ key: '', value: '' }); renderSpecs(); } }, icon('plus'), 'Agregar característica'));
  }
  function renderAcc() {
    accBox.replaceChildren(...accessories.map((a, i) => h('div', { class: 'acc-row' },
      h('input', { type: 'text', placeholder: 'Accesorio incluido', value: a, maxlength: 150, oninput: (e) => { accessories[i] = e.target.value; } }),
      h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'Quitar', onclick: () => { accessories.splice(i, 1); renderAcc(); } }, icon('x')))),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { accessories.push(''); renderAcc(); } }, icon('plus'), 'Agregar accesorio'));
  }

  const save = h('button', { class: 'btn primary', type: 'submit', form: 'itemform' }, editing ? 'Guardar cambios' : 'Crear equipo');
  const form = h('form', { id: 'itemform', class: 'form-grid', onsubmit: (e) => {
    e.preventDefault();
    if (uploading || save.disabled) return;
    fileIn.disabled = true;
    const originalLabel = save.textContent;
    save.textContent = 'Guardando…';
    guarded(save, err, async () => {
      const payload = { ...f, category_id: Number(f.category_id), subcategory_id: f.subcategory_id || null, specs, accessories };
      const saved = editing ? await put(`/api/items/${item.id}`, payload) : await post('/api/items', payload);
      m.close(); toast(editing ? 'Equipo actualizado' : 'Equipo creado'); onSaved?.(saved);
    }).finally(() => { fileIn.disabled = false; save.textContent = originalLabel; });
  } },
  h('div', { class: 'full' }, err),
  h('div', { class: 'full' }, field('Nombre del equipo *', bind('name', { required: true, maxlength: 150, placeholder: 'Ej. Beam 380 Pro' }))),
  field('Categoría *', catSel), field('Subcategoría', subSel),
  field('Marca', bind('brand', { maxlength: 100 })), field('Modelo', bind('model', { maxlength: 100 })),
  field('Código interno', bind('internal_code', { maxlength: 40, placeholder: editing ? '' : 'Automático si se deja vacío' })),
  field('Ubicación física', bind('location', { maxlength: 150, placeholder: 'Bodega, estante…' })),
  h('div', { class: 'form-section' }, 'Modalidad y existencias'),
  h('div', { class: 'full' }, field('Modalidad de inventario', modeBox)), stockBox,
  h('div', { class: 'form-section' }, 'Adquisición'),
  field('Fecha de adquisición', h('input', { type: 'date', value: f.acquisition_date, oninput: (e) => { f.acquisition_date = e.target.value; } })),
  field('Precio de adquisición', bindNum('acquisition_price', { step: 'any' })),
  h('div', { class: 'full' }, field('Proveedor', bind('supplier', { maxlength: 150 }))),
  h('div', { class: 'form-section' }, 'Detalle'),
  h('div', { class: 'full' }, field('Fotografía', h('div', { class: 'stack', style: { gap: '8px' } }, fileIn, photoStatus, photoPrev))),
  h('div', { class: 'full' }, field('Descripción', bindText('description'))),
  h('div', { class: 'full' }, field('Observaciones', bindText('notes'))),
  h('div', { class: 'full' }, field('Características técnicas', specBox)),
  h('div', { class: 'full' }, field('Accesorios incluidos', accBox)));

  form.addEventListener('invalid', (e) => {
    e.target.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, true);
  fillSubs(); renderMode(); renderPhoto(); renderSpecs(); renderAcc();
  const m = modal({ title: editing ? `Editar: ${item.name}` : `Nuevo equipo · ${companyName()}`, wide: true, body: form,
    footer: [h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cancelar'), save] });
}
