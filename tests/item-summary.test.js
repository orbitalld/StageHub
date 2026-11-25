import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatItemSummary, writeSummaryToClipboard } from '../public/js/item-summary.js';

const base = { name: 'Cabeza móvil', model: 'Beam 380', brand: 'Acme', internal_code: 'ILU-0001', category: { name: 'Iluminación' }, stock: { total: 4, available: 2, maintenance: 1, out_of_service: 1 }, tracking_mode: 'individual' };

test('ficha individual incluye números y notas de estado, sin tokens QR', () => {
  const text = formatItemSummary({ ...base, units: [
    { unit_number: 1, status: 'mantenimiento', status_note: 'Arreglando shutter', qr_token: 'SECRET-QR' },
    { unit_number: 2, status: 'disponible' },
    { unit_number: 3, status: 'disponible' },
    { unit_number: 4, status: 'fuera_de_servicio', status_note: 'Fuente dañada' },
  ], specs: [{ key: 'Potencia', value: '380 W' }], accessories: ['Clamp'], location: null });
  assert.match(text, /Modelo de equipo: Beam 380/);
  assert.match(text, /Cantidad total: 4\n  • Disponibles: 2\n  • En mantención: 1\n      ◦ N.º 1/);
  assert.match(text, /Fuera de servicio: 1\n      ◦ N.º 4/);
  assert.match(text, /Estado de mantención:\n  • N.º 1: Arreglando shutter/);
  assert.match(text, /Estado fuera de servicio:\n  • N.º 4: Fuente dañada/);
  assert.match(text, /Potencia: 380 W/); assert.match(text, /Clamp/);
  assert.doesNotMatch(text, /SECRET-QR|null|undefined|Ubicación:|N.º 2|N.º 3/);
});

test('ficha por cantidad no inventa numeración y muestra las notas grupales', () => {
  const text = formatItemSummary({ ...base, tracking_mode: 'cantidad', stock: { total: 20, available: 17, maintenance: 3, out_of_service: 0 }, maintenance_note: 'Revisando conectores', out_of_service_note: 'Nota antigua' });
  assert.match(text, /Cantidad total: 20/); assert.match(text, /En mantención: 3/);
  assert.match(text, /Estado de mantención:\n  • Revisando conectores/);
  assert.doesNotMatch(text, /N.º|Estado fuera de servicio:|Nota antigua/);
});

test('ficha oculta datos opcionales vacíos y distingue una nota de estado no registrada', () => {
  const text = formatItemSummary({ ...base, name: 'Beam', model: null, brand: ' ', internal_code: null, category: null, stock: { total: 1, available: 0, maintenance: 1, out_of_service: 0 }, units: [{ unit_number: 7, status: 'mantenimiento', status_note: null }], specs: [{key:'Peso',value:''}], accessories: [null, ' '] });
  assert.match(text, /Modelo de equipo: Beam/); assert.match(text, /N.º 7: Sin nota registrada/);
  assert.doesNotMatch(text, /null|undefined|Marca:|Código:|Categoría:|Características técnicas:|Accesorios:|Estado fuera de servicio:/);
});

test('portapapeles devuelve éxito solo si se escribe y permite alternativa ante rechazo', async () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let written;
  try {
    Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {clipboard:{writeText:async text => {written=text;}}}});
    assert.equal(await writeSummaryToClipboard('Ficha'), true); assert.equal(written, 'Ficha');
    globalThis.navigator.clipboard.writeText = async () => {throw new Error('No permitido');};
    assert.equal(await writeSummaryToClipboard('Ficha'), false);
    delete globalThis.navigator.clipboard;
    assert.equal(await writeSummaryToClipboard('Ficha'), false);
  } finally { if (old) Object.defineProperty(globalThis, 'navigator', old); else delete globalThis.navigator; }
});
