import { assertCompanyFree,assertInventoryFree } from '../services/events.js';
import { companyRole, requireCompany, isMaster } from '../company-access.js';
import { HttpError } from '../http.js';
import { V } from '../validate.js';
import { tx } from '../db.js';
import { savePhoto, releaseLogo, MAX_LOGO_BYTES } from '../services/photos.js';
import { audit } from '../audit.js';
import { snapshotStock, getItem } from '../services/inventory.js';

export async function selectedCompany(db, c, perm='inventory:read') {
  const raw = c.req.headers['x-stagehub-company'] ?? '1';
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw)<1) throw new HttpError(400,'Empresa inválida');
  const company = await db.prepare('SELECT * FROM companies WHERE id=? AND deleted_at IS NULL').get(Number(raw));
  if (!company) throw new HttpError(404,'Empresa no encontrada');
  await requireCompany(db,c.user,company.id,perm);
  return company.id;
}
export async function requireItemCompany(db, id, companyId, unit=false) {
  const sql=unit?'SELECT i.id FROM units u JOIN items i ON i.id=u.item_id WHERE u.id=? AND i.company_id=?':'SELECT id FROM items WHERE id=? AND company_id=?';
  if (!Number.isSafeInteger(id) || id<1 || !(await db.prepare(sql).get(id,companyId))) throw new HttpError(404,unit?'Unidad no encontrada en esta empresa':'Equipo no encontrado en esta empresa');
}
function fields(body){return [V.str(body,'name','El nombre',{required:true,max:150}),V.str(body,'rut','El RUT',{max:30}),V.str(body,'contact','El contacto',{max:150}),V.str(body,'notes','Las notas',{max:1000})];}
export function registerCompanyRoutes(router,{db,cfg}) {
  const W={perm:'companies:write'};
  router.add('GET','/api/companies',{},async c=>{const master=isMaster(c.user);const rows=await db.prepare(`SELECT c.*, ${master?"'master'":'m.member_role'} AS member_role, (SELECT COUNT(*) FROM items i WHERE i.company_id=c.id) AS item_count,
    (SELECT COALESCE(SUM(v.total),0) FROM items i JOIN v_item_stock v ON v.item_id=i.id WHERE i.company_id=c.id) AS total
    FROM companies c ${master?'':'JOIN company_members m ON m.company_id=c.id AND m.user_id=?'} WHERE c.deleted_at IS NULL ORDER BY c.id`).all(...(master?[]:[c.user.id])); return rows;});
  // Papelera visible exclusivamente al Master global. Se mantienen todas las relaciones.
  router.add('GET','/api/companies/trash',W,async()=>await db.prepare(`SELECT c.id,c.name,c.deleted_at,u.full_name AS deleted_by_name,
    (SELECT COUNT(*) FROM items i WHERE i.company_id=c.id) AS item_count
    FROM companies c LEFT JOIN users u ON u.id=c.deleted_by WHERE c.deleted_at IS NOT NULL ORDER BY c.deleted_at DESC,c.id`).all());
  router.add('DELETE','/api/companies/:id',{},async c=>await tx(db,async()=>{
    const id=Number(c.params.id); await requireCompany(db,c.user,id,'company:delete');await assertCompanyFree(db,id);
    const co=await db.prepare('SELECT name FROM companies WHERE id=? AND deleted_at IS NULL').get(id);
    await db.prepare("UPDATE companies SET deleted_at=datetime('now'),deleted_by=? WHERE id=?").run(c.user.id,id);
    // Revocar invitaciones pendientes: no reactivarlas al recuperar la empresa.
    await db.prepare("UPDATE company_invitations SET status='cancelled' WHERE company_id=? AND status='pending'").run(id);
    await audit(db,{...c.user,company_id:id},'eliminar','company',id,`Empresa enviada a papelera: ${co.name}`);
    c.status=204;
  }));
  router.add('POST','/api/companies/:id/restore',W,async c=>await tx(db,async()=>{
    const id=Number(c.params.id);
    const co=Number.isSafeInteger(id)&&id>0?await db.prepare('SELECT name FROM companies WHERE id=? AND deleted_at IS NOT NULL').get(id):null;
    if(!co)throw new HttpError(404,'Empresa no encontrada en papelera');
    await db.prepare('UPDATE companies SET deleted_at=NULL,deleted_by=NULL WHERE id=?').run(id);
    await audit(db,{...c.user,company_id:id},'restaurar','company',id,`Empresa recuperada: ${co.name}`);
    await snapshotStock(db,id);return {ok:true};
  }));
  router.add('POST','/api/companies',{},async c=>await tx(db,async()=>{
    const f=fields(c.body);
    if(await db.prepare('SELECT id FROM companies WHERE lower(name)=lower(?)').get(f[0]))throw new HttpError(409,'Ya existe una empresa con ese nombre, incluso en la papelera');
    const id=Number((await db.prepare('INSERT INTO companies(name,rut,contact,notes) VALUES (?,?,?,?)').run(...f)).lastInsertRowid);
    await db.prepare('INSERT INTO company_members(company_id,user_id,member_role) VALUES (?,?,?)').run(id,c.user.id,'owner');
    await audit(db,{...c.user,company_id:id},'crear','company',id,`Empresa creada: ${f[0]}`);
    await snapshotStock(db,id); c.status=201;
    return await db.prepare('SELECT * FROM companies WHERE id=?').get(id);
  }));
  router.add('PUT','/api/companies/:id',{},async c=>await tx(db,async()=>{
    const id=Number(c.params.id); await requireCompany(db,c.user,id,'company:edit'); const f=fields(c.body);
    if (!Number.isSafeInteger(id)||!(await db.prepare('SELECT id FROM companies WHERE id=?').get(id))) throw new HttpError(404,'Empresa no encontrada');
    if(await db.prepare('SELECT id FROM companies WHERE lower(name)=lower(?) AND id<>?').get(f[0],id))throw new HttpError(409,'Ya existe una empresa con ese nombre, incluso en la papelera');
    await db.prepare('UPDATE companies SET name=?,rut=?,contact=?,notes=? WHERE id=?').run(...f,id);
    await audit(db,{...c.user,company_id:id},'editar','company',id,`Empresa editada: ${f[0]}`);
    return await db.prepare('SELECT * FROM companies WHERE id=?').get(id);
  }));
  // Permiso companies:write exclusivo del Master. El cliente no puede asignar rutas de archivo.
  async function changeLogo(c, upload) {
    const id=Number(c.params.id);
    const old=Number.isSafeInteger(id)&&id>0 ? await db.prepare('SELECT * FROM companies WHERE id=? AND deleted_at IS NULL').get(id) : null;
    if (!old) throw new HttpError(404,'Empresa no encontrada');
    if (!upload && !old.logo) return {logo:null};
    const logo=upload ? await savePhoto(cfg,c.rawBody,{logo:true}) : null;
    try {
      await tx(db,async()=>{
        await db.prepare('UPDATE companies SET logo=? WHERE id=?').run(logo,id);
        await audit(db,{...c.user,company_id:id},'editar','company',id,`${logo?'Logo actualizado':'Logo eliminado'}: ${old.name}`);
      });
    } catch(e) { if(logo) await releaseLogo({db,cfg},logo); throw e; }
    await releaseLogo({db,cfg},old.logo);
    return {logo};
  }
  router.add('POST','/api/companies/:id/logo',{...W,raw:MAX_LOGO_BYTES},c=>changeLogo(c,true));
  router.add('DELETE','/api/companies/:id/logo',W,c=>changeLogo(c,false));
  // Traslada la referencia completa, con sus unidades, fotografía e historial. Nunca divide cantidades.
  router.add('POST','/api/items/:id/transfer',W,async c=>await tx(db,async()=>{
    const id=Number(c.params.id), from=await selectedCompany(db,c), to=V.int(c.body,'company_id','La empresa de destino',{required:true,min:1,max:Number.MAX_SAFE_INTEGER});
    await requireItemCompany(db,id,from);
    await assertInventoryFree(db,id);
    if(await db.prepare("SELECT id FROM event_lines WHERE item_id=? LIMIT 1").get(id))throw new HttpError(409,"El equipo está vinculado al historial de eventos; no se puede trasladar.");
    if (from===to) throw new HttpError(409,'El equipo ya pertenece a esta empresa');
    const target=await db.prepare('SELECT * FROM companies WHERE id=? AND deleted_at IS NULL').get(to);
    if (!target) throw new HttpError(404,'Empresa de destino no encontrada');
    await db.prepare('DELETE FROM company_photo_uploads WHERE photo=(SELECT photo FROM items WHERE id=?)').run(id);
    await db.prepare("UPDATE items SET company_id=?,updated_by=?,updated_at=datetime('now') WHERE id=?").run(to,c.user.id,id);
    const details={item_id:id,empresa_origen:from,empresa_destino:to};
    await audit(db,{...c.user,company_id:from},'trasladar','item',id,`Equipo trasladado a ${target.name}`,details);
    await audit(db,{...c.user,company_id:to},'recibir','item',id,'Equipo recibido desde otra empresa',details);
    await snapshotStock(db,from); await snapshotStock(db,to);
    return await getItem(db,id);
  }));
}
