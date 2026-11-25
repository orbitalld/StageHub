import { HttpError } from '../http.js';
import { tx } from '../db.js';
import { V } from '../validate.js';
import { audit } from '../audit.js';
import { companyRole, requireCompany, isMaster } from '../company-access.js';
const roles=['reader','inventory','members','manager'];
const idOf=v=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<1)throw new HttpError(400,'Identificador inválido');return n;};
export function registerMembershipRoutes(router,{db}){
 const allowed=(actor,target)=>actor==='master'||(actor==='owner'&&target!=='owner'&&target!=='master')||(['manager','members'].includes(actor)&&['reader','inventory'].includes(target));
 const member=(co,uid)=>db.prepare('SELECT member_role FROM company_members WHERE company_id=? AND user_id=?').get(co,uid);
 const checkRole=(body,actor)=>{const role=V.oneOf(body,'role','El permiso',actor==='master'?[...roles,'owner']:roles);if(!allowed(actor,role))throw new HttpError(403,'No puedes conceder este permiso');return role;};
 const write=async(co,uid,role)=>db.prepare('INSERT INTO company_members(company_id,user_id,member_role) VALUES (?,?,?) ON CONFLICT(company_id,user_id) DO UPDATE SET member_role=excluded.member_role').run(co,uid,role);
 const auditMember=(c,co,uid,msg)=>audit(db,{...c.user,company_id:co},'editar','membership',uid,msg);
 router.add('GET','/api/companies/:id/members',{},async c=>{const co=idOf(c.params.id);await requireCompany(db,c.user,co,'members:write');return await db.prepare('SELECT u.id,u.full_name,u.email,m.member_role FROM company_members m JOIN users u ON u.id=m.user_id WHERE m.company_id=? ORDER BY u.full_name').all(co);});
 router.add('PUT','/api/companies/:id/members/:uid',{},async c=>tx(db,async()=>{
  const co=idOf(c.params.id),uid=idOf(c.params.uid);const actor=await requireCompany(db,c.user,co,'members:write');const role=checkRole(c.body,actor);const old=await member(co,uid);
  if(!old&&actor!=='master')throw new HttpError(403,'Envía una invitación para agregar un miembro');
  if(old&&!allowed(actor,old.member_role))throw new HttpError(403,'No puedes modificar este miembro');
  if(uid===c.user.id)throw new HttpError(409,'No puedes cambiar tu propio permiso');
  const u=await db.prepare('SELECT id,active,approval_status FROM users WHERE id=?').get(uid);if(!u||!u.active||u.approval_status!=='approved')throw new HttpError(422,'La cuenta debe estar activa y aprobada');
  await write(co,uid,role);await db.prepare("UPDATE company_invitations SET status='cancelled' WHERE company_id=? AND recipient_id=? AND status='pending'").run(co,uid);await auditMember(c,co,uid,'Permiso de empresa actualizado');return {ok:true};
 }));
 router.add('DELETE','/api/companies/:id/members/:uid',{},async c=>tx(db,async()=>{
  const co=idOf(c.params.id),uid=idOf(c.params.uid);const actor=await requireCompany(db,c.user,co,'members:write');const old=await member(co,uid);
  if(!old)throw new HttpError(404,'Miembro no encontrado');if(uid===c.user.id||!allowed(actor,old.member_role))throw new HttpError(403,'No puedes quitar este miembro');
  await db.prepare('DELETE FROM company_members WHERE company_id=? AND user_id=?').run(co,uid);await db.prepare("UPDATE company_invitations SET status='cancelled' WHERE company_id=? AND recipient_id=? AND status='pending'").run(co,uid);await auditMember(c,co,uid,'Acceso a empresa retirado');c.status=204;
 }));
 router.add('GET','/api/users/:id/companies',{perm:'users:write'},async c=>await db.prepare('SELECT company_id,member_role FROM company_members WHERE user_id=?').all(idOf(c.params.id)));
 router.add('GET','/api/companies/:id/invitations',{},async c=>{const co=idOf(c.params.id);await requireCompany(db,c.user,co,'members:write');return await db.prepare("SELECT i.id,i.member_role,i.status,u.email,u.full_name FROM company_invitations i JOIN users u ON u.id=i.recipient_id WHERE i.company_id=? AND i.status='pending' ORDER BY i.id DESC").all(co);});
 router.add('POST','/api/companies/:id/invitations',{},async c=>tx(db,async()=>{
  const co=idOf(c.params.id);const actor=await requireCompany(db,c.user,co,'members:write');const role=checkRole(c.body,actor);if(role==='owner')throw new HttpError(422,'No se invita como propietario');
  const email=V.str(c.body,'email','El correo',{required:true,max:254}).toLowerCase();const u=await db.prepare('SELECT id,active,approval_status FROM users WHERE lower(email)=lower(?)').get(email);
  if(!u||!u.active||u.approval_status!=='approved')throw new HttpError(422,'La invitación requiere una cuenta existente, activa y aprobada');
  if(u.id===c.user.id||await member(co,u.id))throw new HttpError(409,'El usuario ya pertenece a la empresa');
  const n=(await db.prepare("INSERT INTO company_invitations(company_id,recipient_id,sender_id,member_role) VALUES (?,?,?,?)").run(co,u.id,c.user.id,role)).lastInsertRowid;
  await auditMember(c,co,u.id,'Invitación a empresa enviada');c.status=201;return {id:Number(n)};
 }));
 router.add('DELETE','/api/companies/:id/invitations/:inv',{},async c=>tx(db,async()=>{const co=idOf(c.params.id);const actor=await requireCompany(db,c.user,co,'members:write');const inv=await db.prepare("SELECT * FROM company_invitations WHERE id=? AND company_id=? AND status='pending'").get(idOf(c.params.inv),co);if(!inv)throw new HttpError(404,'Invitación no encontrada');if(!allowed(actor,inv.member_role))throw new HttpError(403,'No puedes cancelar esta invitación');await db.prepare("UPDATE company_invitations SET status='cancelled' WHERE id=?").run(inv.id);c.status=204;}));
 router.add('GET','/api/requests',{},async c=>await db.prepare("SELECT i.id,i.company_id,i.member_role,i.created_at,c.name AS company_name,u.full_name AS sender_name FROM company_invitations i JOIN companies c ON c.id=i.company_id JOIN users u ON u.id=i.sender_id WHERE i.recipient_id=? AND i.status='pending' ORDER BY i.id DESC").all(c.user.id));
 router.add('POST','/api/requests/:id/respond',{},async c=>tx(db,async()=>{
  const decision=V.oneOf(c.body,'decision','La respuesta',['accepted','declined']);const i=await db.prepare("SELECT * FROM company_invitations WHERE id=? AND recipient_id=? AND status='pending'").get(idOf(c.params.id),c.user.id);if(!i)throw new HttpError(404,'Solicitud no encontrada');
  if(decision==='accepted'){
   const sender=await db.prepare('SELECT * FROM users WHERE id=?').get(i.sender_id);const actor=sender&&sender.active&&sender.approval_status==='approved'?await companyRole(db,sender,i.company_id):null;
   if(!allowed(actor,i.member_role))throw new HttpError(409,'La invitación ya no tiene autorización');
   if(await member(i.company_id,c.user.id))throw new HttpError(409,'Ya tienes acceso a esta empresa');
   await write(i.company_id,c.user.id,i.member_role);
  }
  await db.prepare('UPDATE company_invitations SET status=? WHERE id=?').run(decision,i.id);await auditMember(c,i.company_id,c.user.id,decision==='accepted'?'Invitación aceptada':'Invitación rechazada');return {ok:true};
 }));
}
