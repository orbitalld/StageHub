import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildConfig } from '../server/config.js';
import { createApp } from '../server/app.js';

let app, base, dir, cookie, ilu, beam;

async function call(method, url, body) {
  const headers = { 'X-Requested-With': 'stagehub', Cookie: cookie || '' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const t = await res.text();
  return { status: res.status, json: t ? JSON.parse(t) : null };
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stagehub-num-'));
  app = await createApp(buildConfig({ databaseUrl: "", dataDir: dir, port: 0, host: '127.0.0.1' }));
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
  await call('POST', '/api/auth/setup', { username: 'admin', full_name: 'Admin', password: 'clave-segura-1' });
  const cats = (await call('GET', '/api/categories')).json;
  ilu = cats.find((c) => c.name === 'Iluminación');
  const r = await call('POST', '/api/items', { name: 'Beam 380', category_id: ilu.id, subcategory_id: ilu.subcategories[0].id, initial_units: 3 });
  beam = r.json;
});
after(async () => { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('las máquinas se numeran solas 1..n y la numeración continúa', async () => {
  assert.deepEqual(beam.units.map((u) => u.unit_number), [1, 2, 3]);
  let r = await call('POST', `/api/items/${beam.id}/units`, { count: 2 });
  assert.deepEqual(r.json.units.map((u) => u.unit_number), [1, 2, 3, 4, 5]);
});

test('numeración inicial personalizada y choques de número', async () => {
  let r = await call('POST', `/api/items/${beam.id}/units`, { count: 2, start_number: 20 });
  assert.equal(r.status, 201);
  assert.deepEqual(r.json.units.map((u) => u.unit_number), [1, 2, 3, 4, 5, 20, 21]);
  r = await call('POST', `/api/items/${beam.id}/units`, { count: 3, start_number: 19 });
  assert.equal(r.status, 409, 'el rango 19-21 pisa la 20 y 21');
  assert.match(r.json.error, /N\.º 20/);
  assert.equal((await call('GET', `/api/items/${beam.id}`)).json.units.length, 7, 'no se creó nada a medias');
  assert.equal((await call('POST', `/api/items/${beam.id}/units`, { count: 1, start_number: 0 })).status, 422);
});

test('renumerar una máquina: único por equipo, el mismo número puede existir en otro equipo', async () => {
  const u = beam.units[0];
  let r = await call('PUT', `/api/units/${u.id}`, { unit_number: 2, status: 'disponible' });
  assert.equal(r.status, 409);
  r = await call('PUT', `/api/units/${u.id}`, { unit_number: 12, status: 'disponible' });
  assert.equal(r.status, 200);
  assert.ok(r.json.units.find((x) => x.id === u.id).unit_number === 12);
  const other = (await call('POST', '/api/items', { name: 'Wash 500', category_id: ilu.id, initial_units: 1 })).json;
  r = await call('PUT', `/api/units/${other.units[0].id}`, { unit_number: 12, status: 'disponible' });
  assert.equal(r.status, 200, 'N.º 12 también en otro equipo');
});

test('mantención / fuera de servicio con nota, autor y fecha; se limpia al volver a disponible', async () => {
  const u = (await call('GET', `/api/items/${beam.id}`)).json.units.find((x) => x.unit_number === 12);
  let r = await call('PUT', `/api/units/${u.id}`, { status: 'mantenimiento', status_note: 'Lámpara quemada, enviar a servicio' });
  let uu = r.json.units.find((x) => x.id === u.id);
  assert.equal(uu.status_note, 'Lámpara quemada, enviar a servicio');
  assert.equal(uu.status_changed_by, 'admin');
  assert.ok(uu.status_changed_at);
  assert.equal(r.json.stock.maintenance, 1);

  // cambia solo la nota: conserva fecha y autor del cambio de estado
  const when = uu.status_changed_at;
  r = await call('PUT', `/api/units/${u.id}`, { status: 'mantenimiento', status_note: 'Lámpara repuesta, falta calibrar' });
  uu = r.json.units.find((x) => x.id === u.id);
  assert.equal(uu.status_note, 'Lámpara repuesta, falta calibrar');
  assert.equal(uu.status_changed_at, when);

  r = await call('PUT', `/api/units/${u.id}`, { status: 'fuera_de_servicio', status_note: 'Motor de pan dañado' });
  assert.equal(r.json.stock.out_of_service, 1);
  assert.equal(r.json.stock.maintenance, 0);

  r = await call('PUT', `/api/units/${u.id}`, { status: 'disponible', status_note: 'esto debe ignorarse' });
  uu = r.json.units.find((x) => x.id === u.id);
  assert.equal(uu.status_note, null);
  assert.equal(uu.status_changed_at, null);
  assert.equal(r.json.stock.available, r.json.stock.total);

  assert.equal((await call('PUT', `/api/units/${u.id}`, { status: 'mantenimiento', status_note: 'x'.repeat(501) })).status, 422);
});

test('el historial conserva las notas con el número de máquina', async () => {
  const h = (await call('GET', `/api/items/${beam.id}/history`)).json.map((x) => x.summary);
  assert.ok(h.some((s) => s.includes('N.º 12') && s.includes('Disponible → En mantenimiento') && s.includes('Nota: Lámpara quemada')), h.join('\n'));
  assert.ok(h.some((s) => s.includes('En mantenimiento → Fuera de servicio') && s.includes('Motor de pan dañado')));
  assert.ok(h.some((s) => s.includes('renumerada')));
});

test('búsqueda por número de máquina', async () => {
  let r = await call('GET', '/api/items?search=12');
  assert.ok(r.json.items.some((i) => i.id === beam.id), 'encuentra por N.º 12');
  r = await call('GET', '/api/items?search=21');
  assert.deepEqual(r.json.items.map((i) => i.id), [beam.id]);
  r = await call('GET', '/api/items?search=999');
  assert.equal(r.json.total, 0);
});

test('equipos por cantidad: notas de mantención / fuera de servicio', async () => {
  const cats = (await call('GET', '/api/categories')).json;
  const cab = cats.find((c) => c.name === 'Cableado y Accesorios');
  let r = await call('POST', '/api/items', { name: 'Cable DMX 5m', category_id: cab.id, qty_total: 30, qty_maintenance: 4, qty_out_of_service: 0,
    maintenance_note: 'Conectores sueltos', out_of_service_note: 'no debe guardarse (no hay cantidad)' });
  assert.equal(r.status, 201);
  assert.equal(r.json.maintenance_note, 'Conectores sueltos');
  assert.equal(r.json.out_of_service_note, null);
  const id = r.json.id;
  r = await call('PUT', `/api/items/${id}`, { name: 'Cable DMX 5m', category_id: cab.id, qty_total: 30, qty_maintenance: 0, qty_out_of_service: 2, out_of_service_note: 'Cortados' , maintenance_note: 'viejo' });
  assert.equal(r.json.maintenance_note, null, 'sin cantidad en mantenimiento la nota se limpia');
  assert.equal(r.json.out_of_service_note, 'Cortados');
});

test('migración 002 sobre una base antigua numera las unidades existentes', async () => {
  const { openDb, migrate } = await import('../server/db.js');
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'stagehub-old-'));
  const db = openDb(path.join(d2, 'old.db'));
  const mdir = path.join(d2, 'm'); fs.mkdirSync(mdir);
  fs.copyFileSync(path.join(app.cfg.migrationsDir, '001_fase1_base.sql'), path.join(mdir, '001_fase1_base.sql'));
  migrate(db, mdir);
  db.exec(`INSERT INTO categories(name) VALUES ('C'); INSERT INTO items(internal_code,name,category_id,tracking_mode) VALUES ('A-1','A',1,'individual'),('B-1','B',1,'individual');
    INSERT INTO units(item_id,unit_code,qr_token) VALUES (1,'A-1-001','t1'),(1,'A-1-002','t2'),(2,'B-1-001','t3'),(1,'A-1-003','t4');`);
  fs.copyFileSync(path.join(app.cfg.migrationsDir, '002_numeracion_y_notas_estado.sql'), path.join(mdir, '002_numeracion_y_notas_estado.sql'));
  assert.deepEqual(migrate(db, mdir, { backupDir: path.join(d2, 'bk') }), ['002_numeracion_y_notas_estado.sql']);
  assert.deepEqual(db.prepare('SELECT unit_code, unit_number FROM units ORDER BY id').all().map((r) => [r.unit_code, r.unit_number]),
    [['A-1-001', 1], ['A-1-002', 2], ['B-1-001', 1], ['A-1-003', 3]]);
  assert.equal(fs.readdirSync(path.join(d2, 'bk')).length, 1, 'respaldo previo a migrar');
  db.close(); fs.rmSync(d2, { recursive: true, force: true });
});
