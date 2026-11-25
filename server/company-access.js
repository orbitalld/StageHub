import { effectiveRole } from './permissions.js';
import { HttpError } from './http.js';
export const isMaster = u => effectiveRole(u)==='master';
export const memberRoles=['reader','inventory','members','manager','owner'];
export async function companyRole(db,user,id){
 if(isMaster(user))return 'master';
 return (await db.prepare('SELECT member_role FROM company_members WHERE company_id=? AND user_id=?').get(id,user.id))?.member_role || null;
}
export function memberCan(role,perm){
 if(role==='master')return true;
 if(!role)return false;
 if(perm==='inventory:read')return true;
 if(['inventory:write','audit:read'].includes(perm))return ['inventory','manager','owner'].includes(role);
 if(perm==='members:write')return ['members','manager','owner'].includes(role);
 if(perm==='company:edit')return role==='owner';
 return false;
}
export async function requireCompany(db,user,id,perm='inventory:read'){
 if(!Number.isSafeInteger(id)||id<1)throw new HttpError(400,'Empresa inválida');
 if(!(await db.prepare('SELECT id FROM companies WHERE id=?').get(id)))throw new HttpError(404,'Empresa no encontrada');
 const role=await companyRole(db,user,id);
 if(!memberCan(role,perm))throw new HttpError(403,'No tienes permiso en esta empresa');
 return role;
}
export async function photoAllowed(db,user,name){
 const rows=await db.prepare('SELECT company_id FROM items WHERE photo=? UNION SELECT company_id FROM company_photo_uploads WHERE photo=?').all(name,name);
 for(const r of rows)if(await companyRole(db,user,r.company_id))return true;
 return false;
}
export async function requirePhotoCompany(db,company,name){
 if(!name||typeof name!=='string')return;
 const found=await db.prepare('SELECT company_id FROM items WHERE photo=? AND company_id=? UNION SELECT company_id FROM company_photo_uploads WHERE photo=? AND company_id=?').get(name,company,name,company);
 if(!found)throw new HttpError(422,'Fotografía no disponible en esta empresa');
}
