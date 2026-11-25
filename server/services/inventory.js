// Núcleo del inventario: equipos, unidades individuales, existencias y panel de control.
import crypto from 'node:crypto';
import { HttpError } from '../http.js';
import { V } from '../validate.js';
import { tx } from '../db.js';
import { audit } from '../audit.js';
import { PHOTO_RE, copyPhoto, releasePhoto } from './photos.js';

export const UNIT_STATUSES = ['disponible', 'mantenimiento', 'fuera_de_servicio'];
export const TRACKING = ['individual', 'cantidad'];
const STATUS_LABEL = { disponible: 'Disponible', mantenimiento: 'En mantenimiento', fuera_de_servicio: 'Fuera de servicio' };

const SELECT_ITEM = `
  SELECT i.*, c.name AS category_name, c.color AS category_color, s.name AS subcategory_name,
         v.total, v.maintenance, v.out_of_service, v.available
  FROM items i
  JOIN categories c ON c.id = i.category_id
  LEFT JOIN subcategories s ON s.id = i.subcategory_id
  JOIN v_item_stock v ON v.item_id = i.id`;

function mapItem(r) {
  const status = r.total === 0 ? 'sin_stock' : r.available === r.total ? 'disponible' : r.available === 0 ? 'no_disponible' : 'parcial';
  return {
    id: r.id, company_id:r.company_id, internal_code: r.internal_code, name: r.name,
    category: { id: r.category_id, name: r.category_name, color: r.category_color },
    subcategory: r.subcategory_id ? { id: r.subcategory_id, name: r.subcategory_name } : null,
    brand: r.brand, model: r.model, tracking_mode: r.tracking_mode,
    min_stock: r.min_stock, location: r.location,
    acquisition_date: r.acquisition_date, acquisition_price: r.acquisition_price, supplier: r.supplier,
    photo: r.photo, description: r.description, notes: r.notes,
    maintenance_note: r.maintenance_note, out_of_service_note: r.out_of_service_note,
    specs: JSON.parse(r.specs || '[]'), accessories: JSON.parse(r.accessories || '[]'),
    stock: { total: r.total, maintenance: r.maintenance, out_of_service: r.out_of_service, available: r.available, status },
    low_stock: r.min_stock > 0 && r.available < r.min_stock,
    created_at: r.created_at, updated_at: r.updated_at,
  };
}

const escLike = (s) => `%${s.replace(/[\\%_]/g, '\\$&')}%`;

export async function listItems(db, q = {}) {
  const where = ['i.company_id = ?']; const args = [q.company_id ?? 1];
  if (q.search?.trim()) {
    const like = escLike(q.search.trim());
    where.push(`(i.name LIKE ? ESCAPE '\\' OR i.brand LIKE ? ESCAPE '\\' OR i.model LIKE ? ESCAPE '\\' OR i.internal_code LIKE ? ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM units u WHERE u.item_id = i.id AND (u.serial_number LIKE ? ESCAPE '\\' OR u.unit_code LIKE ? ESCAPE '\\')))`);
    args.push(like, like, like, like, like, like);
    if (/^\d{1,5}$/.test(q.search.trim())) {   // "12" también encuentra la máquina N.º 12
      where[where.length - 1] = where.at(-1).replace(/\)$/, ' OR EXISTS (SELECT 1 FROM units un WHERE un.item_id = i.id AND un.unit_number = ?))');
      args.push(Number(q.search.trim()));
    }
  }
  if (q.category_id) { where.push('i.category_id = ?'); args.push(Number(q.category_id)); }
  if (q.subcategory_id) { where.push('i.subcategory_id = ?'); args.push(Number(q.subcategory_id)); }
  if (TRACKING.includes(q.mode)) { where.push('i.tracking_mode = ?'); args.push(q.mode); }
  const statusSql = {
    disponible: 'v.available > 0', mantenimiento: 'v.maintenance > 0', fuera_de_servicio: 'v.out_of_service > 0',
    bajo_stock: 'i.min_stock > 0 AND v.available < i.min_stock', sin_stock: 'v.total = 0',
  }[q.status];
  if (statusSql) where.push(statusSql);
  const W = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const sortCol = { name: 'i.name', code: 'i.internal_code', category: 'c.name, i.name', total: 'v.total',
    available: 'v.available', updated: 'i.updated_at' }[q.sort] || 'i.name';
  const dir = q.dir === 'desc' ? 'DESC' : 'ASC';
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 25, 1), 200);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);

  const total = (await db.prepare(`SELECT COUNT(*) AS n FROM items i ${statusSql?'JOIN v_item_stock v ON v.item_id = i.id':''} ${W}`).get(...args)).n;
  const rows = (await db.prepare(`${SELECT_ITEM} ${W} ORDER BY ${sortCol} ${dir}, i.id LIMIT ? OFFSET ?`)
    .all(...args, limit, (page - 1) * limit));
  return { items: rows.map(mapItem), total, page, limit };
}

export async function getItem(db, id) {
  const r = (await db.prepare(`${SELECT_ITEM} WHERE i.id = ?`).get(id));
  if (!r) throw new HttpError(404, 'Equipo no encontrado');
  const item = mapItem(r);
  if (r.tracking_mode === 'individual') {
    item.units = (await db.prepare(`SELECT id, unit_number, unit_code, serial_number, qr_token, status, status_note, status_changed_at,
                                    status_changed_by, location, notes, created_at, updated_at
                             FROM units WHERE item_id = ? ORDER BY unit_number, id`).all(id)).map((u) => ({ ...u }));
  }
  return item;
}

// ---------- códigos ----------
const prefixOf = (name) => (name.normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3) || 'EQP').padEnd(3, 'X');

async function nextCode(db, prefix) {
  for (;;) {
    (await db.prepare(`INSERT INTO counters(key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1`).run(`code:${prefix}`));
    const n = (await db.prepare('SELECT value FROM counters WHERE key = ?').get(`code:${prefix}`)).value;
    const code = `${prefix}-${String(n).padStart(4, '0')}`;
    if (!(await db.prepare('SELECT 1 FROM items WHERE internal_code = ?').get(code))) return code;
  }
}

// ---------- snapshot diario para el gráfico de evolución ----------
export async function snapshotStock(db, companyId=1) {
  const t = (await db.prepare(`SELECT COALESCE(SUM(total),0) AS total, COALESCE(SUM(available),0) AS available,
      COALESCE(SUM(maintenance),0) AS maintenance, COALESCE(SUM(out_of_service),0) AS out_of_service FROM v_item_stock v JOIN items i ON i.id=v.item_id WHERE i.company_id=?`).get(companyId));
  (await db.prepare(`INSERT INTO company_stock_snapshots(company_id,day, total, available, maintenance, out_of_service)
              VALUES (?,date('now','localtime'), ?,?,?,?)
              ON CONFLICT(company_id,day) DO UPDATE SET total=excluded.total, available=excluded.available,
                maintenance=excluded.maintenance, out_of_service=excluded.out_of_service`)
    .run(companyId,t.total, t.available, t.maintenance, t.out_of_service));
}

// ---------- validación de equipos ----------
const ITEM_COLS = ['internal_code', 'name', 'category_id', 'subcategory_id', 'brand', 'model', 'tracking_mode',
  'qty_total', 'qty_maintenance', 'qty_out_of_service', 'min_stock', 'location', 'acquisition_date',
  'acquisition_price', 'supplier', 'photo', 'description', 'notes', 'specs', 'accessories', 'maintenance_note', 'out_of_service_note'];

async function parseItem(db, body, existing) {
  const name = V.str(body, 'name', 'El nombre', { max: 150, required: true });
  const category_id = V.int(body, 'category_id', 'La categoría', { min: 1, required: true });
  const cat = (await db.prepare('SELECT * FROM categories WHERE id = ?').get(category_id));
  if (!cat) V.fail('category_id', 'La categoría no existe');
  let sub = null;
  const subId = V.int(body, 'subcategory_id', 'La subcategoría', { min: 1 });
  if (subId) {
    sub = (await db.prepare('SELECT * FROM subcategories WHERE id = ?').get(subId));
    if (!sub || sub.category_id !== category_id) V.fail('subcategory_id', 'La subcategoría no pertenece a la categoría elegida');
  }
  const tracking_mode = V.oneOf(body, 'tracking_mode', 'La modalidad', TRACKING, existing?.tracking_mode || sub?.tracking_mode || cat.tracking_mode);

  let code = V.str(body, 'internal_code', 'El código interno', { max: 40 });
  if (code && !/^[A-Za-z0-9._-]+$/.test(code)) V.fail('internal_code', 'El código solo admite letras, números, punto, guion y guion bajo');
  if (code && (await db.prepare('SELECT 1 FROM items WHERE internal_code = ? AND id <> ?').get(code, existing?.id ?? 0))) {
    throw new HttpError(409, 'Ya existe un equipo con ese código interno', { field: 'internal_code' });
  }
  if (!code && existing) code = existing.internal_code;

  let qty_total = 0, qty_maintenance = 0, qty_out_of_service = 0;
  if (tracking_mode === 'cantidad') {
    qty_total = V.int(body, 'qty_total', 'La cantidad total', { def: 0 });
    qty_maintenance = V.int(body, 'qty_maintenance', 'La cantidad en mantenimiento', { def: 0 });
    qty_out_of_service = V.int(body, 'qty_out_of_service', 'La cantidad fuera de servicio', { def: 0 });
    if (qty_maintenance + qty_out_of_service > qty_total) {
      V.fail('qty_total', 'Las unidades en mantenimiento y fuera de servicio no pueden superar la cantidad total');
    }
  }

  const photo = V.str(body, 'photo', 'La fotografía', { max: 60 });
  if (photo && !PHOTO_RE.test(photo)) V.fail('photo', 'La fotografía no es válida');

  const specsRaw = body.specs ?? [];
  if (!Array.isArray(specsRaw) || specsRaw.length > 40) V.fail('specs', 'Las características técnicas no son válidas');
  const specs = specsRaw.map((s) => ({
    key: V.str(s, 'key', 'El nombre de la característica', { max: 80 }),
    value: V.str(s, 'value', 'El valor de la característica', { max: 300 }),
  })).filter((s) => s.key);

  return {
    code, fields: {
      name, category_id, subcategory_id: subId || null,
      brand: V.str(body, 'brand', 'La marca', { max: 100 }), model: V.str(body, 'model', 'El modelo', { max: 100 }),
      tracking_mode, qty_total, qty_maintenance, qty_out_of_service,
      min_stock: V.int(body, 'min_stock', 'El stock mínimo', { def: 0, max: 1_000_000 }),
      location: V.str(body, 'location', 'La ubicación', { max: 150 }),
      acquisition_date: V.date(body, 'acquisition_date', 'La fecha de adquisición'),
      acquisition_price: V.num(body, 'acquisition_price', 'El precio de adquisición'),
      supplier: V.str(body, 'supplier', 'El proveedor', { max: 150 }),
      photo, description: V.str(body, 'description', 'La descripción', { max: 2000 }),
      notes: V.str(body, 'notes', 'Las observaciones', { max: 2000 }),
      specs: JSON.stringify(specs),
      accessories: JSON.stringify(V.strList(body, 'accessories', 'Los accesorios')),
      // Las notas solo tienen sentido si hay unidades en ese estado (modo por cantidad).
      maintenance_note: tracking_mode === 'cantidad' && qty_maintenance > 0 ? V.str(body, 'maintenance_note', 'La nota de mantenimiento', { max: 500 }) : null,
      out_of_service_note: tracking_mode === 'cantidad' && qty_out_of_service > 0 ? V.str(body, 'out_of_service_note', 'La nota de fuera de servicio', { max: 500 }) : null,
    }, cat,
  };
}

// ---------- unidades ----------
async function insertUnits(db, item, serials, startNumber = null) {
  let seq = (await db.prepare('SELECT unit_seq FROM items WHERE id = ?').get(item.id)).unit_seq;
  let num = startNumber ?? (await db.prepare('SELECT COALESCE(MAX(unit_number), 0) + 1 AS n FROM units WHERE item_id = ?').get(item.id)).n;
  if (startNumber != null) {
    const clash = (await db.prepare('SELECT unit_number FROM units WHERE item_id = ? AND unit_number BETWEEN ? AND ? ORDER BY unit_number LIMIT 1')
      .get(item.id, num, num + serials.length - 1));
    if (clash) throw new HttpError(409, `Ya existe la unidad N.º ${clash.unit_number}. Elige otra numeración inicial.`, { field: 'start_number' });
  }
  const rows=[];
  for (const serial of serials) {
    seq += 1;
    rows.push([item.id, `${item.internal_code}-${String(seq).padStart(3, '0')}`, serial, crypto.randomUUID(), item.location ?? null, num++]);
  }
  if(rows.length)await db.prepare(`INSERT INTO units(item_id, unit_code, serial_number, qr_token, location, unit_number) VALUES ${rows.map(()=>'(?,?,?,?,?,?)').join(',')}`).run(...rows.flat());
  (await db.prepare('UPDATE items SET unit_seq = ? WHERE id = ?').run(seq, item.id));
}

// ---------- CRUD de equipos ----------
export async function createItem(ctx, user, body) {
  const { db } = ctx;
  const { code, fields, cat } = (await parseItem(db, body, null));
  const initial = V.int(body, 'initial_units', 'Las unidades iniciales', { def: 0, max: 500 });
  return (await tx(db, async () => {
    const internal_code = code || (await nextCode(db, prefixOf(cat.name)));
    const vals = { ...fields, internal_code };
    const cols = [...ITEM_COLS, 'company_id','created_by', 'updated_by'];
    const r = (await db.prepare(`INSERT INTO items(${cols.join(',')}) VALUES (${cols.map((c) => ':' + c).join(',')})`)
      .run({ ...Object.fromEntries(ITEM_COLS.map((c) => [c, vals[c] ?? null])), company_id: user.company_id ?? 1, created_by: user.id, updated_by: user.id }));
    const id = Number(r.lastInsertRowid);
    if (fields.tracking_mode === 'individual' && initial > 0) {
      (await insertUnits(db, { id, internal_code, location: fields.location }, Array.from({ length: initial }, () => null)));
    }
    (await audit(db, user, 'crear', 'item', id, `Equipo creado: ${fields.name} (${internal_code})`, { item_id: id }));
    (await snapshotStock(db,user.company_id ?? 1));
    return (await getItem(db, id));
  }));
}

export async function updateItem(ctx, user, id, body) {
  const { db } = ctx;
  const existing = (await db.prepare('SELECT * FROM items WHERE id = ?').get(id));
  if (!existing) throw new HttpError(404, 'Equipo no encontrado');
  const { code, fields } = (await parseItem(db, body, existing));

  if (fields.tracking_mode !== existing.tracking_mode) {
    const hasStock = existing.tracking_mode === 'individual'
      ? (await db.prepare('SELECT COUNT(*) AS n FROM units WHERE item_id = ?').get(id)).n > 0
      : existing.qty_total > 0;
    if (hasStock) {
      throw new HttpError(409, 'No se puede cambiar la modalidad de un equipo que ya tiene existencias. Elimina o traslada primero las unidades/cantidades.', { field: 'tracking_mode' });
    }
  }
  // En modo individual las cantidades las determinan las unidades.
  if (existing.tracking_mode === 'individual' && fields.tracking_mode === 'individual') {
    fields.qty_total = fields.qty_maintenance = fields.qty_out_of_service = 0;
  }
  const result = (await tx(db, async () => {
    const vals = { ...fields, internal_code: code };
    const sets = ITEM_COLS.map((c) => `${c} = :${c}`).join(', ');
    (await db.prepare(`UPDATE items SET ${sets}, updated_by = :updated_by, updated_at = datetime('now') WHERE id = :id`)
      .run({ ...Object.fromEntries(ITEM_COLS.map((c) => [c, vals[c] ?? null])), updated_by: user.id, id }));

    const changes = [];
    for (const c of ['name', 'brand', 'model', 'location', 'qty_total', 'qty_maintenance', 'qty_out_of_service', 'min_stock', 'category_id', 'subcategory_id', 'internal_code']) {
      if ((existing[c] ?? null) !== (vals[c] ?? null)) changes.push({ campo: c, antes: existing[c] ?? null, despues: vals[c] ?? null });
    }
    (await audit(db, user, 'editar', 'item', id, `Equipo editado: ${fields.name}`, { item_id: id, cambios: changes }));
    (await snapshotStock(db,user.company_id ?? 1));
    
    return (await getItem(db, id));
  }));
  if(existing.photo && existing.photo!==fields.photo) await releasePhoto(ctx,existing.photo);
  return result;
}

export async function deleteItem(ctx, user, id) {
  const { db } = ctx;
  const existing = (await db.prepare('SELECT * FROM items WHERE id = ?').get(id));
  if (!existing) throw new HttpError(404, 'Equipo no encontrado');
  // Las fases siguientes añaden aquí la verificación de reservas, despachos y mantenimientos vinculados.
  (await tx(db, async () => {
    (await db.prepare('DELETE FROM items WHERE id = ?').run(id));
    (await audit(db, user, 'eliminar', 'item', id, `Equipo eliminado: ${existing.name} (${existing.internal_code})`,
      { item_id: id, tracking_mode: existing.tracking_mode }));
    (await snapshotStock(db,user.company_id ?? 1));
  }));
  (await releasePhoto(ctx, existing.photo));
}

export async function duplicateItem(ctx, user, id) {
  const { db, cfg } = ctx;
  const src = (await db.prepare('SELECT * FROM items WHERE id = ?').get(id));
  if (!src) throw new HttpError(404, 'Equipo no encontrado');
  const cat = (await db.prepare('SELECT name FROM categories WHERE id = ?').get(src.category_id));
  return (await tx(db, async () => {
    const vals = { ...src, internal_code: (await nextCode(db, prefixOf(cat.name))), name: `${src.name} (copia)`.slice(0, 150),
      qty_total: 0, qty_maintenance: 0, qty_out_of_service: 0, photo: (await copyPhoto(cfg, src.photo)) };
    const cols = [...ITEM_COLS, 'company_id','created_by', 'updated_by'];
    const r = (await db.prepare(`INSERT INTO items(${cols.join(',')}) VALUES (${cols.map((c) => ':' + c).join(',')})`)
      .run({ ...Object.fromEntries(ITEM_COLS.map((c) => [c, vals[c] ?? null])), company_id: user.company_id ?? 1, created_by: user.id, updated_by: user.id }));
    const newId = Number(r.lastInsertRowid);
    (await audit(db, user, 'duplicar', 'item', newId, `Equipo duplicado desde ${src.internal_code}: ${vals.name}`, { item_id: newId, origen: id }));
    return (await getItem(db, newId));
  }));
}

export async function itemHistory(db, id, limit = 50, companyId = null) {
  // El historial sigue siendo consultable aunque el equipo ya no exista.
  return (await db.prepare(`SELECT id, ts, username, action, entity, summary FROM audit_log
    WHERE ((entity = 'item' AND entity_id = ?) OR (entity = 'unit' AND json_extract(details, '$.item_id') = ?))
    ${companyId===null?'':'AND company_id=?'} ORDER BY id DESC LIMIT ?`).all(id, id, ...(companyId===null?[]:[companyId]), Math.min(limit, 200))).map((r) => ({ ...r }));
}

// ---------- unidades individuales ----------
export async function addUnits(ctx, user, itemId, body) {
  const { db } = ctx;
  const item = (await db.prepare('SELECT * FROM items WHERE id = ?').get(itemId));
  if (!item) throw new HttpError(404, 'Equipo no encontrado');
  if (item.tracking_mode !== 'individual') throw new HttpError(409, 'Este equipo se administra por cantidades, no por unidades individuales');

  let serials;
  if (Array.isArray(body.serials) && body.serials.some((s) => String(s).trim())) {
    serials = body.serials.map((s) => String(s).trim()).filter(Boolean);
    if (serials.length > 500) V.fail('serials', 'Máximo 500 unidades por operación');
    if (serials.some((s) => s.length > 80)) V.fail('serials', 'Cada número de serie admite hasta 80 caracteres');
    const lower = serials.map((s) => s.toLowerCase());
    const dup = lower.find((s, i) => lower.indexOf(s) !== i);
    if (dup) V.fail('serials', `Número de serie repetido en la lista: ${dup}`);
    const used = new Set((await db.prepare('SELECT serial_number FROM units WHERE item_id = ? AND serial_number IS NOT NULL').all(itemId)).map(r=>r.serial_number.toLowerCase()));
    for (const s of serials) if (used.has(s.toLowerCase())) throw new HttpError(409, `Ya existe una unidad con el número de serie ${s}`, { field: 'serials' });
  } else {
    const count = V.int(body, 'count', 'La cantidad', { min: 1, max: 500, required: true });
    serials = Array.from({ length: count }, () => null);
  }
  const start = V.int(body, 'start_number', 'La numeración inicial', { min: 1, max: 99999 });
  return (await tx(db, async () => {
    (await insertUnits(db, item, serials, start));
    (await db.prepare(`UPDATE items SET updated_by = ?, updated_at = datetime('now') WHERE id = ?`).run(user.id, itemId));
    (await audit(db, user, 'crear', 'unit', null, `${serials.length} unidad(es) agregada(s) a ${item.name}`, { item_id: itemId, cantidad: serials.length }));
    (await snapshotStock(db,user.company_id ?? 1));
    return (await getItem(db, itemId));
  }));
}

export async function updateUnit(ctx, user, unitId, body) {
  const { db } = ctx;
  const unit = (await db.prepare('SELECT * FROM units WHERE id = ?').get(unitId));
  if (!unit) throw new HttpError(404, 'Unidad no encontrada');
  const serial = V.str(body, 'serial_number', 'El número de serie', { max: 80 });
  const status = V.oneOf(body, 'status', 'El estado', UNIT_STATUSES, unit.status);
  const location = V.str(body, 'location', 'La ubicación', { max: 150 });
  const notes = V.str(body, 'notes', 'Las observaciones', { max: 1000 });
  const number = V.int(body, 'unit_number', 'El número de unidad', { min: 1, max: 99999, def: unit.unit_number });
  const noteIn = V.str(body, 'status_note', 'La nota', { max: 500 });
  // La nota explica por qué la máquina no está disponible; al volver a "disponible" se limpia (queda en el historial).
  const statusNote = status === 'disponible' ? null : noteIn;
  if (serial && (await db.prepare('SELECT 1 FROM units WHERE item_id = ? AND serial_number = ? AND id <> ?').get(unit.item_id, serial, unitId))) {
    throw new HttpError(409, 'Ya existe otra unidad de este equipo con ese número de serie', { field: 'serial_number' });
  }
  if (number != null && (await db.prepare('SELECT 1 FROM units WHERE item_id = ? AND unit_number = ? AND id <> ?').get(unit.item_id, number, unitId))) {
    throw new HttpError(409, `Ya existe la unidad N.º ${number} en este equipo`, { field: 'unit_number' });
  }
  const statusChanged = status !== unit.status;
  return (await tx(db, async () => {
    (await db.prepare(`UPDATE units SET serial_number=?, status=?, location=?, notes=?, unit_number=?, status_note=?, updated_at=datetime('now') WHERE id=?`)
      .run(serial, status, location, notes, number, statusNote, unitId));
    if (statusChanged) {
      (await db.prepare(`UPDATE units SET status_changed_at = ?, status_changed_by = ? WHERE id = ?`)
        .run(status === 'disponible' ? null : new Date().toISOString().slice(0, 19).replace('T', ' '), status === 'disponible' ? null : (user.email ? user.full_name : user.username), unitId));
    }
    const label = `Unidad N.º ${number ?? '—'} (${unit.unit_code})`;
    let summary = `${label} editada`;
    if (number !== unit.unit_number) summary += ` · renumerada N.º ${unit.unit_number ?? '—'} → ${number}`;
    if (statusChanged) summary += `: ${STATUS_LABEL[unit.status]} → ${STATUS_LABEL[status]}`;
    if (statusNote && (statusChanged || statusNote !== unit.status_note)) summary += ` — Nota: ${statusNote}`;
    (await audit(db, user, 'editar', 'unit', unitId, summary,
      { item_id: unit.item_id, estado_anterior: unit.status, estado_nuevo: status, nota: statusNote }));
    (await snapshotStock(db,user.company_id ?? 1));
    return (await getItem(db, unit.item_id));
  }));
}

export async function deleteUnit(ctx, user, unitId) {
  const { db } = ctx;
  const unit = (await db.prepare('SELECT * FROM units WHERE id = ?').get(unitId));
  if (!unit) throw new HttpError(404, 'Unidad no encontrada');
  return (await tx(db, async () => {
    (await db.prepare('DELETE FROM units WHERE id = ?').run(unitId));
    (await audit(db, user, 'eliminar', 'unit', unitId, `Unidad eliminada: N.º ${unit.unit_number ?? '—'} (${unit.unit_code})`, { item_id: unit.item_id }));
    (await snapshotStock(db,user.company_id ?? 1));
    return (await getItem(db, unit.item_id));
  }));
}

// ---------- panel de control ----------
export async function dashboard(db, companyId=1) {
  const totals = (await db.prepare(`SELECT COUNT(*) AS references_count, COALESCE(SUM(total),0) AS total,
      COALESCE(SUM(available),0) AS available, COALESCE(SUM(maintenance),0) AS maintenance,
      COALESCE(SUM(out_of_service),0) AS out_of_service FROM v_item_stock v JOIN items i ON i.id=v.item_id WHERE i.company_id=?`).get(companyId));
  const by_category = (await db.prepare(`
    SELECT c.id, c.name, c.color, COALESCE(SUM(v.total),0) AS total, COALESCE(SUM(v.available),0) AS available
    FROM categories c LEFT JOIN items i ON i.category_id = c.id AND i.company_id = ? LEFT JOIN v_item_stock v ON v.item_id = i.id
    GROUP BY c.id ORDER BY c.sort_order, c.name`).all(companyId)).map((r) => ({ ...r }));
  const low_stock = (await db.prepare(`
    SELECT i.id, i.internal_code, i.name, i.min_stock, v.available, v.total
    FROM items i JOIN v_item_stock v ON v.item_id = i.id
    WHERE i.company_id=? AND i.min_stock > 0 AND v.available < i.min_stock
    ORDER BY (i.min_stock - v.available) DESC, i.name LIMIT 15`).all(companyId)).map((r) => ({ ...r }));
  const evolution = (await db.prepare(`SELECT * FROM (SELECT * FROM company_stock_snapshots WHERE company_id=? ORDER BY day DESC LIMIT 90) AS recent_days ORDER BY day`).all(companyId)).map((r) => ({ ...r }));
  const recent = (await db.prepare(`SELECT id, ts, username, action, entity, entity_id, summary FROM audit_log
                             WHERE company_id=? AND entity IN ('item','unit') ORDER BY id DESC LIMIT 8`).all(companyId)).map((r) => ({ ...r }));
  return { totals: { ...totals }, by_category, low_stock, evolution, recent };
}
