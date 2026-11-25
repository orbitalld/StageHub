import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildConfig } from '../server/config.js';
import { createApp } from '../server/app.js';
import { createUser } from '../server/users.js';

let app, base, dir;
const jars = {};

async function call(who, method, url, body, extra = {}) {
  const headers = { 'X-Requested-With': 'stagehub', ...(extra.headers || {}) };
  if (jars[who]) headers.Cookie = jars[who];
  let payload = extra.raw;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + url, { method, headers, body: payload });
  const sc = res.headers.get('set-cookie');
  if (sc) jars[who] = sc.split(';')[0];
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null, res };
}
const login = (who, username, password = 'clave-segura-1') => call(who, 'POST', '/api/auth/login', { username, password });

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stagehub-'));
  app = await createApp(buildConfig({ databaseUrl: "", dataDir: dir, port: 0, host: '127.0.0.1' }));
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});
after(async () => { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('primer arranque: requiere configuración y crea el administrador', async () => {
  let r = await call('admin', 'GET', '/api/auth/status');
  assert.equal(r.json.setup_required, true);
  r = await call('admin', 'POST', '/api/auth/setup', { username: 'admin', full_name: 'Admin', password: 'corta' });
  assert.equal(r.status, 422);
  r = await call('admin', 'POST', '/api/auth/setup', { username: 'admin', full_name: 'Admin', password: 'clave-segura-1' });
  assert.equal(r.status, 201);
  assert.equal(r.json.user.role, 'master');
  r = await call('x', 'POST', '/api/auth/setup', { username: 'otro', full_name: 'Otro', password: 'clave-segura-1' });
  assert.equal(r.status, 409, 'no se puede repetir la configuración inicial');
  // usuarios de otros roles para probar permisos
  for (const [u, role] of [['bodega1', 'bodega'], ['consulta1', 'consulta'], ['tecnico1', 'tecnico']]) {
    const created=await createUser(app.db, { username: u, full_name: u, role, password: 'clave-segura-1' });
    app.db.prepare('INSERT INTO company_members VALUES (?,?,?)').run(1,created.id,role==='bodega'?'inventory':'reader');
  }
});

test('seguridad: sin sesión, sin cabecera CSRF y contraseña errónea', async () => {
  assert.equal((await call('anon', 'GET', '/api/items')).status, 401);
  const noHeader = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(noHeader.status, 403);
  assert.equal((await login('anon', 'admin', 'incorrecta')).status, 401);
  assert.equal((await call('anon', 'GET', '/uploads/' + 'a'.repeat(32) + '.jpg')).status, 401);
});

test('catálogo inicial cargado y editable', async () => {
  let r = await call('admin', 'GET', '/api/categories');
  assert.equal(r.status, 200);
  const names = r.json.map((c) => c.name);
  for (const n of ['Iluminación', 'Pantallas LED y Video', 'Audio', 'Estructuras y Truss', 'Escenario', 'Electricidad', 'Cableado y Accesorios']) assert.ok(names.includes(n), n);
  const ilu = r.json.find((c) => c.name === 'Iluminación');
  assert.ok(ilu.subcategories.find((s) => s.name === 'Beam' && s.tracking_mode === 'individual'));
  const escenario = r.json.find((c) => c.name === 'Escenario');
  assert.deepEqual(escenario.subcategories.find((s) => s.name === 'Tarimas').spec_template, ['Ancho (m)', 'Largo (m)', 'Alto (m)']);

  r = await call('admin', 'POST', '/api/categories', { name: 'Efectos Especiales', color: '#ff00aa', tracking_mode: 'individual' });
  assert.equal(r.status, 201);
  const id = r.json.id;
  assert.equal((await call('admin', 'POST', '/api/categories', { name: 'efectos especiales' })).status, 409, 'nombre duplicado sin distinguir mayúsculas');
  r = await call('admin', 'POST', `/api/categories/${id}/subcategories`, { name: 'Humo', tracking_mode: 'cantidad', spec_template: ['Potencia (W)'] });
  assert.equal(r.status, 201);
  assert.equal((await call('admin', 'PUT', `/api/categories/${id}`, { name: 'Efectos', color: '#00ffaa', tracking_mode: 'individual' })).status, 200);
  assert.equal((await call('admin', 'DELETE', `/api/subcategories/${r.json.id}`)).status, 204);
  assert.equal((await call('admin', 'DELETE', `/api/categories/${id}`)).status, 204);
});

let beam, cable;
test('equipo individual: unidades, códigos, series únicas y existencias', async () => {
  const cats = (await call('admin', 'GET', '/api/categories')).json;
  const ilu = cats.find((c) => c.name === 'Iluminación');
  const sub = ilu.subcategories.find((s) => s.name === 'Beam');
  let r = await call('bodega', 'POST', '/api/items', {}); // sin login aún
  assert.equal(r.status, 401);
  await login('bodega', 'bodega1');
  r = await call('bodega', 'POST', '/api/items', { name: 'Beam 380', category_id: ilu.id, subcategory_id: sub.id, brand: 'Acme', min_stock: 5, initial_units: 4, specs: [{ key: 'Potencia', value: '380 W' }], accessories: ['Clamp', 'Cable PowerCON'] });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  beam = r.json;
  assert.match(beam.internal_code, /^ILU-\d{4}$/);
  assert.equal(beam.tracking_mode, 'individual');
  assert.equal(beam.units.length, 4);
  assert.equal(beam.stock.total, 4);
  assert.equal(beam.stock.available, 4);
  assert.equal(beam.low_stock, true, 'disponible 4 < mínimo 5');
  assert.match(beam.units[0].unit_code, /-001$/);
  assert.notEqual(beam.units[0].qr_token, beam.units[1].qr_token);

  // series
  r = await call('bodega', 'POST', `/api/items/${beam.id}/units`, { serials: ['SN-1', 'SN-2'] });
  assert.equal(r.status, 201);
  assert.equal(r.json.stock.total, 6);
  assert.equal((await call('bodega', 'POST', `/api/items/${beam.id}/units`, { serials: ['sn-1'] })).status, 409, 'serie duplicada (sin distinguir mayúsculas)');
  assert.equal((await call('bodega', 'POST', `/api/items/${beam.id}/units`, { serials: ['A', 'a'] })).status, 422);

  // cambio de estado de una unidad
  const u = r.json.units.find((x) => x.serial_number === 'SN-1');
  r = await call('bodega', 'PUT', `/api/units/${u.id}`, { serial_number: 'SN-1', status: 'mantenimiento', notes: 'Lámpara' });
  assert.equal(r.json.stock.maintenance, 1);
  assert.equal(r.json.stock.available, 5);
  assert.equal(r.json.stock.status, 'parcial');
  r = await call('bodega', 'DELETE', `/api/units/${u.id}`);
  assert.equal(r.json.stock.total, 5);
  assert.equal(r.json.stock.maintenance, 0);
});

test('equipo por cantidad: validaciones y cálculo', async () => {
  const cats = (await call('admin', 'GET', '/api/categories')).json;
  const cab = cats.find((c) => c.name === 'Cableado y Accesorios');
  const dmx = cab.subcategories.find((s) => s.name === 'DMX');
  let r = await call('bodega', 'POST', '/api/items', { name: 'Cable DMX 5m', category_id: cab.id, subcategory_id: dmx.id, qty_total: 10, qty_maintenance: 8, qty_out_of_service: 5 });
  assert.equal(r.status, 422, 'mantenimiento + fuera de servicio no puede exceder el total');
  r = await call('bodega', 'POST', '/api/items', { name: 'Cable DMX 5m', category_id: cab.id, subcategory_id: dmx.id, qty_total: 40, qty_maintenance: 3, qty_out_of_service: 2, min_stock: 50 });
  assert.equal(r.status, 201);
  cable = r.json;
  assert.equal(cable.tracking_mode, 'cantidad');
  assert.deepEqual([cable.stock.total, cable.stock.available], [40, 35]);
  assert.equal(cable.low_stock, true);
  assert.equal((await call('bodega', 'POST', `/api/items/${cable.id}/units`, { count: 2 })).status, 409, 'no admite unidades individuales');

  // subcategoría que no corresponde a la categoría
  const ilu = cats.find((c) => c.name === 'Iluminación');
  r = await call('bodega', 'POST', '/api/items', { name: 'X', category_id: ilu.id, subcategory_id: dmx.id });
  assert.equal(r.status, 422);
  // código manual duplicado
  r = await call('bodega', 'POST', '/api/items', { name: 'Otro', category_id: cab.id, internal_code: cable.internal_code.toLowerCase() });
  assert.equal(r.status, 409);
});

test('listado: búsqueda, filtros, orden y paginación', async () => {
  let r = await call('consulta', 'GET', '/api/items');
  assert.equal(r.status, 401);
  await login('consulta', 'consulta1');
  r = await call('consulta', 'GET', '/api/items?search=SN-2');
  assert.equal(r.json.total, 1, 'busca por número de serie de unidades');
  assert.equal(r.json.items[0].id, beam.id);
  r = await call('consulta', 'GET', '/api/items?search=100%25');
  assert.equal(r.json.total, 0, 'el % se trata como texto literal');
  r = await call('consulta', 'GET', '/api/items?mode=cantidad');
  assert.ok(r.json.items.every((i) => i.tracking_mode === 'cantidad'));
  r = await call('consulta', 'GET', '/api/items?status=bajo_stock&sort=total&dir=desc');
  assert.equal(r.json.total, 1, 'solo el cable (35 < 50); el beam tiene 5 y el mínimo es 5');
  assert.equal(r.json.items[0].id, cable.id);
  r = await call('consulta', 'GET', '/api/items?limit=1&page=2&sort=name');
  assert.equal(r.json.items.length, 1);
  assert.equal(r.json.total, 2);
});

test('permisos por rol', async () => {
  const body = { name: 'Intento', category_id: beam.category.id };
  assert.equal((await call('consulta', 'POST', '/api/items', body)).status, 403);
  await login('tecnico', 'tecnico1');
  assert.equal((await call('tecnico', 'PUT', `/api/items/${beam.id}`, body)).status, 403);
  assert.equal((await call('tecnico', 'DELETE', `/api/items/${beam.id}`)).status, 403);
  assert.equal((await call('tecnico', 'GET', `/api/items/${beam.id}`)).status, 200);
  assert.equal((await call('consulta', 'POST', '/api/categories', { name: 'Nueva' })).status, 403);
  assert.equal((await call('consulta', 'GET', '/api/audit')).status, 403);
  assert.equal((await call('admin', 'GET', '/api/audit')).status, 200);
});

test('edición: cambio de modalidad bloqueado con existencias; duplicar; eliminar', async () => {
  let r = await call('bodega', 'PUT', `/api/items/${cable.id}`, { ...cable, category_id: cable.category.id, subcategory_id: cable.subcategory.id, tracking_mode: 'individual' });
  assert.equal(r.status, 409);
  r = await call('bodega', 'PUT', `/api/items/${cable.id}`, { name: 'Cable DMX 10m', category_id: cable.category.id, subcategory_id: cable.subcategory.id, qty_total: 60, qty_maintenance: 0, qty_out_of_service: 0, min_stock: 20 });
  assert.equal(r.status, 200);
  assert.equal(r.json.stock.available, 60);
  assert.equal(r.json.low_stock, false);
  assert.equal(r.json.internal_code, cable.internal_code, 'el código se conserva');

  r = await call('bodega', 'POST', `/api/items/${cable.id}/duplicate`);
  assert.equal(r.status, 201);
  assert.equal(r.json.name, 'Cable DMX 10m (copia)');
  assert.notEqual(r.json.internal_code, cable.internal_code);
  assert.equal(r.json.stock.total, 0);
  const copyId = r.json.id;
  assert.equal((await call('bodega', 'DELETE', `/api/items/${copyId}`)).status, 204);
  assert.equal((await call('bodega', 'GET', `/api/items/${copyId}`)).status, 404);
});

test('categoría con equipos no se puede eliminar', async () => {
  const r = await call('admin', 'DELETE', `/api/categories/${beam.category.id}`);
  assert.equal(r.status, 409);
  const s = await call('admin', 'DELETE', `/api/subcategories/${beam.subcategory.id}`);
  assert.equal(s.status, 409);
});

test('fotografía: solo imágenes reales; se sirve únicamente con sesión', async () => {
  let r = await call('bodega', 'POST', '/api/uploads/photo', undefined, { raw: Buffer.from('esto no es una imagen'), headers: { 'Content-Type': 'image/jpeg' } });
  assert.equal(r.status, 415);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
  r = await call('bodega', 'POST', '/api/uploads/photo', undefined, { raw: png, headers: { 'Content-Type': 'image/png' } });
  assert.equal(r.status, 201);
  const photo = r.json.photo;
  const served = await fetch(`${base}/uploads/${photo}`, { headers: { Cookie: jars.bodega } });
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/png');
  assert.equal((await fetch(`${base}/uploads/${photo}`)).status, 401);
  // se asocia a un equipo y se limpia al eliminarlo
  const cats = (await call('admin', 'GET', '/api/categories')).json;
  const e = await call('bodega', 'POST', '/api/items', { name: 'Con foto', category_id: cats[0].id, photo });
  assert.equal(e.status, 201);
  const file = path.join(app.cfg.uploadsDir, photo);
  assert.ok(fs.existsSync(file));
  assert.equal((await call('bodega', 'DELETE', `/api/items/${e.json.id}`)).status, 204);
  assert.ok(!fs.existsSync(file), 'la foto huérfana se elimina');
});

test('historial y panel de control reflejan datos reales', async () => {
  let r = await call('admin', 'GET', `/api/items/${beam.id}/history`);
  assert.ok(r.json.length >= 4);
  assert.ok(r.json.every((h) => h.username));
  const upd = await call('admin', 'PUT', `/api/items/${beam.id}`, { name: beam.name, category_id: beam.category.id, subcategory_id: beam.subcategory.id, min_stock: 8 });
  assert.equal(upd.status, 200);
  r = await call('admin', 'GET', '/api/dashboard');
  assert.equal(r.status, 200);
  assert.equal(r.json.totals.references_count, 2);
  assert.equal(r.json.totals.total, 5 + 60);
  assert.equal(r.json.totals.available, 65);
  assert.equal(r.json.low_stock.length, 1);
  assert.equal(r.json.low_stock[0].id, beam.id);
  assert.equal(r.json.by_category.find((c) => c.name === 'Iluminación').total, 5);
  assert.ok(r.json.evolution.length >= 1);
});

test('cambio de contraseña', async () => {
  let r = await call('tecnico', 'POST', '/api/auth/change-password', { current: 'mala', next: 'nueva-clave-99' });
  assert.equal(r.status, 422);
  r = await call('tecnico', 'POST', '/api/auth/change-password', { current: 'clave-segura-1', next: 'nueva-clave-99' });
  assert.equal(r.status, 204);
  assert.equal((await login('t2', 'tecnico1', 'clave-segura-1')).status, 401);
  assert.equal((await login('t2', 'tecnico1', 'nueva-clave-99')).status, 200);
});

test('logout invalida la sesión y el limitador bloquea fuerza bruta', async () => {
  assert.equal((await call('t2', 'POST', '/api/auth/logout')).status, 204);
  const old = jars.t2;
  jars.t2 = old;
  assert.equal((await call('t2', 'GET', '/api/items')).status, 401);
  let last;
  for (let i = 0; i < 9; i++) last = await login('bf', 'consulta1', 'mal-' + i);
  assert.equal(last.status, 429);
});

test('migraciones: reabrir la base no reaplica nada y conserva datos', async () => {
  const { openDb, migrate } = await import('../server/db.js');
  const again = openDb(app.cfg.dbFile);
  assert.deepEqual(migrate(again, app.cfg.migrationsDir), []);
  assert.equal(again.prepare('SELECT COUNT(*) AS n FROM items').get().n, 2);
  again.close();
});
