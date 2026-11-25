import { HttpError } from '../http.js';
import { V } from '../validate.js';
import { tx } from '../db.js';
import { audit } from '../audit.js';
import { snapshotStock, getItem } from '../services/inventory.js';

export async function selectedCompany(db, c) {
  const raw = c.req.headers['x-stagehub-company'] ?? '1';
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw)<1) throw new HttpError(400,'Empresa inválida');
  const company = await db.prepare('SELECT * FROM companies WHERE id=?').get(Number(raw));
  if (!company) throw new HttpError(404,'Empresa no encontrada');
  return company.id;
}
export async function requireItemCompany(db, id, companyId, unit=false) {
  const sql=unit?'SELECT i.id FROM units u JOIN items i ON i.id=u.item_id WHERE u.id=? AND i.company_id=?':'SELECT id FROM items WHERE id=? AND company_id=?';
  if (!Number.isSafeInteger(id) || id<1 || !(await db.prepare(sql).get(id,companyId))) throw new HttpError(404,unit?'Unidad no encontrada en esta empresa':'Equipo no encontrado en esta empresa');
}
function fields(body){return [V.str(body,'name','El nombre',{required:true,max:150}),V.str(body,'rut','El RUT',{max:30}),V.str(body,'contact','El contacto',{max:150}),V.str(body,'notes','Las notas',{max:1000})];}
export function registerCompanyRoutes(router,{db}) {
  const R={perm:'inventory:read'}, W={perm:'companies:write'};
  router.add('GET','/api/companies',R,async()=>await db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM items i WHERE i.company_id=c.id) AS item_count,
    (SELECT COALESCE(SUM(v.total),0) FROM items i JOIN v_item_stock v ON v.item_id=i.id WHERE i.company_id=c.id) AS total
    FROM companies c ORDER BY c.id`).all());
  router.add('POST','/api/companies',W,async c=>await tx(db,async()=>{
    const f=fields(c.body);
    const id=Number((await db.prepare('INSERT INTO companies(name,rut,contact,notes) VALUES (?,?,?,?)').run(...f)).lastInsertRowid);
    await audit(db,c.user,'crear','company',id,`Empresa creada: ${f[0]}`);
    await snapshotStock(db,id); c.status=201;
    return await db.prepare('SELECT * FROM companies WHERE id=?').get(id);
  }));
  router.add('PUT','/api/companies/:id',W,async c=>await tx(db,async()=>{
    const id=Number(c.params.id); const f=fields(c.body);
    if (!Number.isSafeInteger(id)||!(await db.prepare('SELECT id FROM companies WHERE id=?').get(id))) throw new HttpError(404,'Empresa no encontrada');
    await db.prepare('UPDATE companies SET name=?,rut=?,contact=?,notes=? WHERE id=?').run(...f,id);
    await audit(db,c.user,'editar','company',id,`Empresa editada: ${f[0]}`);
    return await db.prepare('SELECT * FROM companies WHERE id=?').get(id);
  }));
  // Traslada la referencia completa, con sus unidades, fotografía e historial. Nunca divide cantidades.
  router.add('POST','/api/items/:id/transfer',W,async c=>await tx(db,async()=>{
    const id=Number(c.params.id), from=await selectedCompany(db,c), to=V.int(c.body,'company_id','La empresa de destino',{required:true,min:1,max:Number.MAX_SAFE_INTEGER});
    await requireItemCompany(db,id,from);
    if (from===to) throw new HttpError(409,'El equipo ya pertenece a esta empresa');
    const target=await db.prepare('SELECT * FROM companies WHERE id=?').get(to);
    if (!target) throw new HttpError(404,'Empresa de destino no encontrada');
    await db.prepare("UPDATE items SET company_id=?,updated_by=?,updated_at=datetime('now') WHERE id=?").run(to,c.user.id,id);
    const details={item_id:id,empresa_origen:from,empresa_destino:to};
    await audit(db,{...c.user,company_id:from},'trasladar','item',id,`Equipo trasladado a ${target.name}`,details);
    await audit(db,{...c.user,company_id:to},'recibir','item',id,'Equipo recibido desde otra empresa',details);
    await snapshotStock(db,from); await snapshotStock(db,to);
    return await getItem(db,id);
  }));
}
