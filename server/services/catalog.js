// Categorías y subcategorías dinámicas.
import { HttpError } from '../http.js';
import { V } from '../validate.js';
import { tx } from '../db.js';
import { audit } from '../audit.js';

const MODES = ['individual', 'cantidad'];

export async function listCatalog(db) {
  const cats = (await db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM items i WHERE i.category_id = c.id) AS item_count
    FROM categories c ORDER BY c.sort_order, c.name`).all());
  const subs = (await db.prepare(`
    SELECT s.*, (SELECT COUNT(*) FROM items i WHERE i.subcategory_id = s.id) AS item_count
    FROM subcategories s ORDER BY s.sort_order, s.name`).all());
  return cats.map((c) => ({
    ...c,
    subcategories: subs.filter((s) => s.category_id === c.id)
      .map((s) => ({ ...s, spec_template: JSON.parse(s.spec_template || '[]') })),
  }));
}

function categoryFields(body) {
  return {
    name: V.str(body, 'name', 'El nombre', { max: 60, required: true }),
    color: V.color(body, 'color'),
    tracking_mode: V.oneOf(body, 'tracking_mode', 'La modalidad', MODES, 'individual'),
  };
}

export async function createCategory(db, user, body) {
  const f = categoryFields(body);
  if ((await db.prepare('SELECT 1 FROM categories WHERE name = ?').get(f.name))) {
    throw new HttpError(409, 'Ya existe una categoría con ese nombre', { field: 'name' });
  }
  return (await tx(db, async () => {
    const order = (await db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM categories').get()).n;
    const id = Number((await db.prepare('INSERT INTO categories(name, color, tracking_mode, sort_order) VALUES (?,?,?,?)')
      .run(f.name, f.color, f.tracking_mode, order)).lastInsertRowid);
    (await audit(db, user, 'crear', 'category', id, `Categoría creada: ${f.name}`));
    return id;
  }));
}

export async function updateCategory(db, user, id, body) {
  const cur = (await db.prepare('SELECT * FROM categories WHERE id = ?').get(id));
  if (!cur) throw new HttpError(404, 'Categoría no encontrada');
  const f = categoryFields(body);
  if ((await db.prepare('SELECT 1 FROM categories WHERE name = ? AND id <> ?').get(f.name, id))) {
    throw new HttpError(409, 'Ya existe una categoría con ese nombre', { field: 'name' });
  }
  (await tx(db, async () => {
    (await db.prepare('UPDATE categories SET name=?, color=?, tracking_mode=? WHERE id=?').run(f.name, f.color, f.tracking_mode, id));
    (await audit(db, user, 'editar', 'category', id, `Categoría editada: ${f.name}`));
  }));
}

export async function deleteCategory(db, user, id) {
  const cur = (await db.prepare('SELECT * FROM categories WHERE id = ?').get(id));
  if (!cur) throw new HttpError(404, 'Categoría no encontrada');
  const n = (await db.prepare('SELECT COUNT(*) AS n FROM items WHERE category_id = ?').get(id)).n;
  if (n > 0) throw new HttpError(409, `No se puede eliminar: tiene ${n} equipo(s) asociado(s). Reasígnalos primero.`);
  (await tx(db, async () => {
    (await db.prepare('DELETE FROM categories WHERE id = ?').run(id));
    (await audit(db, user, 'eliminar', 'category', id, `Categoría eliminada: ${cur.name}`));
  }));
}

function subFields(body) {
  const template = V.strList(body, 'spec_template', 'Las características sugeridas', { max: 60, maxItems: 20 });
  return {
    name: V.str(body, 'name', 'El nombre', { max: 80, required: true }),
    tracking_mode: V.oneOf(body, 'tracking_mode', 'La modalidad', MODES, 'individual'),
    spec_template: JSON.stringify(template),
  };
}

export async function createSubcategory(db, user, categoryId, body) {
  const cat = (await db.prepare('SELECT * FROM categories WHERE id = ?').get(categoryId));
  if (!cat) throw new HttpError(404, 'Categoría no encontrada');
  const f = subFields({ tracking_mode: cat.tracking_mode, ...body });
  if ((await db.prepare('SELECT 1 FROM subcategories WHERE category_id = ? AND name = ?').get(categoryId, f.name))) {
    throw new HttpError(409, 'Ya existe una subcategoría con ese nombre en esta categoría', { field: 'name' });
  }
  return (await tx(db, async () => {
    const order = (await db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM subcategories WHERE category_id = ?').get(categoryId)).n;
    const id = Number((await db.prepare('INSERT INTO subcategories(category_id, name, tracking_mode, spec_template, sort_order) VALUES (?,?,?,?,?)')
      .run(categoryId, f.name, f.tracking_mode, f.spec_template, order)).lastInsertRowid);
    (await audit(db, user, 'crear', 'subcategory', id, `Subcategoría creada: ${cat.name} › ${f.name}`));
    return id;
  }));
}

export async function updateSubcategory(db, user, id, body) {
  const cur = (await db.prepare('SELECT * FROM subcategories WHERE id = ?').get(id));
  if (!cur) throw new HttpError(404, 'Subcategoría no encontrada');
  const f = subFields(body);
  if ((await db.prepare('SELECT 1 FROM subcategories WHERE category_id = ? AND name = ? AND id <> ?').get(cur.category_id, f.name, id))) {
    throw new HttpError(409, 'Ya existe una subcategoría con ese nombre en esta categoría', { field: 'name' });
  }
  (await tx(db, async () => {
    (await db.prepare('UPDATE subcategories SET name=?, tracking_mode=?, spec_template=? WHERE id=?').run(f.name, f.tracking_mode, f.spec_template, id));
    (await audit(db, user, 'editar', 'subcategory', id, `Subcategoría editada: ${f.name}`));
  }));
}

export async function deleteSubcategory(db, user, id) {
  const cur = (await db.prepare('SELECT * FROM subcategories WHERE id = ?').get(id));
  if (!cur) throw new HttpError(404, 'Subcategoría no encontrada');
  const n = (await db.prepare('SELECT COUNT(*) AS n FROM items WHERE subcategory_id = ?').get(id)).n;
  if (n > 0) throw new HttpError(409, `No se puede eliminar: tiene ${n} equipo(s) asociado(s). Reasígnalos primero.`);
  (await tx(db, async () => {
    (await db.prepare('DELETE FROM subcategories WHERE id = ?').run(id));
    (await audit(db, user, 'eliminar', 'subcategory', id, `Subcategoría eliminada: ${cur.name}`));
  }));
}
