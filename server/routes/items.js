import { assertInventoryFree } from '../services/events.js';
import { requirePhotoCompany, isMaster } from '../company-access.js';
import * as inv from '../services/inventory.js';
import { HttpError } from '../http.js';
import { savePhoto, MAX_PHOTO_BYTES, PHOTO_RE } from '../services/photos.js';
import { selectedCompany, requireItemCompany } from './companies.js';

export function registerItemRoutes(router, ctx) {
  const { db } = ctx;
  const R = {}, W = {};
  const id = c => Number(c.params.id);
  const scoped = (fn, kind=null) => async c => {
    const companyId=await selectedCompany(db,c,c.req.method==='GET'?'inventory:read':'inventory:write');
    if(kind) {await requireItemCompany(db,id(c),companyId,kind==='unit'); if(c.req.method!=='GET'){const itemId=kind==='unit'?(await db.prepare('SELECT item_id FROM units WHERE id=?').get(id(c))).item_id:id(c);await assertInventoryFree(db,itemId);if(kind==='item'&&c.req.method==='DELETE'&&await db.prepare("SELECT id FROM event_lines WHERE item_id=? LIMIT 1").get(itemId))throw new HttpError(409,"El equipo está vinculado a eventos; conserva su registro.");}}
    c.user={...c.user,company_id:companyId};
    if(['POST','PUT'].includes(c.req.method)&&c.body.photo) { if (typeof c.body.photo==='string' && !PHOTO_RE.test(c.body.photo)) throw new HttpError(422,'Fotografía inválida'); await requirePhotoCompany(db,companyId,c.body.photo); }
    return await fn(c,companyId);
  };
  router.add('GET', '/api/items', R, scoped((c,company_id)=>inv.listItems(db,{...c.query,company_id})));
  router.add('POST', '/api/items', W, scoped(async c=>{c.status=201;return await inv.createItem(ctx,c.user,c.body);}));
  router.add('GET', '/api/items/:id', R, scoped(c=>inv.getItem(db,id(c)),'item'));
  router.add('PUT', '/api/items/:id', W, scoped(c=>inv.updateItem(ctx,c.user,id(c),c.body),'item'));
  router.add('DELETE', '/api/items/:id', W, scoped(async c=>{await inv.deleteItem(ctx,c.user,id(c));c.status=204;},'item'));
  router.add('POST', '/api/items/:id/duplicate', W, scoped(async c=>{c.status=201;return await inv.duplicateItem(ctx,c.user,id(c));},'item'));
  router.add('GET', '/api/items/:id/history', R, scoped(async(c,companyId)=>{const item=await db.prepare('SELECT company_id FROM items WHERE id=?').get(id(c));
    if(item){await requireItemCompany(db,id(c),companyId);return await inv.itemHistory(db,id(c),50,isMaster(c.user)?null:companyId);}
    return await inv.itemHistory(db,id(c),50,companyId);}));
  router.add('POST', '/api/items/:id/units', W, scoped(async c=>{c.status=201;return await inv.addUnits(ctx,c.user,id(c),c.body);},'item'));
  router.add('PUT', '/api/units/:id', W, scoped(c=>inv.updateUnit(ctx,c.user,id(c),c.body),'unit'));
  router.add('DELETE', '/api/units/:id', W, scoped(c=>inv.deleteUnit(ctx,c.user,id(c)),'unit'));
  router.add('POST', '/api/uploads/photo', { raw:MAX_PHOTO_BYTES }, scoped(async c=>{c.status=201;const photo=await savePhoto(ctx.cfg,c.rawBody);await db.prepare('INSERT INTO company_photo_uploads(photo,company_id) VALUES (?,?)').run(photo,c.user.company_id);return {photo};}));
}
