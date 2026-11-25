import * as inv from '../services/inventory.js';
import { savePhoto, MAX_PHOTO_BYTES } from '../services/photos.js';
import { selectedCompany, requireItemCompany } from './companies.js';

export function registerItemRoutes(router, ctx) {
  const { db } = ctx;
  const R = { perm: 'inventory:read' }, W = { perm: 'inventory:write' };
  const id = c => Number(c.params.id);
  const scoped = (fn, kind=null) => async c => {
    const companyId=await selectedCompany(db,c);
    if(kind) await requireItemCompany(db,id(c),companyId,kind==='unit');
    c.user={...c.user,company_id:companyId};
    return await fn(c,companyId);
  };
  router.add('GET', '/api/items', R, scoped((c,company_id)=>inv.listItems(db,{...c.query,company_id})));
  router.add('POST', '/api/items', W, scoped(async c=>{c.status=201;return await inv.createItem(ctx,c.user,c.body);}));
  router.add('GET', '/api/items/:id', R, scoped(c=>inv.getItem(db,id(c)),'item'));
  router.add('PUT', '/api/items/:id', W, scoped(c=>inv.updateItem(ctx,c.user,id(c),c.body),'item'));
  router.add('DELETE', '/api/items/:id', W, scoped(async c=>{await inv.deleteItem(ctx,c.user,id(c));c.status=204;},'item'));
  router.add('POST', '/api/items/:id/duplicate', W, scoped(async c=>{c.status=201;return await inv.duplicateItem(ctx,c.user,id(c));},'item'));
  router.add('GET', '/api/items/:id/history', R, scoped(async(c,companyId)=>{const item=await db.prepare('SELECT company_id FROM items WHERE id=?').get(id(c));
    if(item){await requireItemCompany(db,id(c),companyId);return await inv.itemHistory(db,id(c));}
    return await inv.itemHistory(db,id(c),50,companyId);}));
  router.add('POST', '/api/items/:id/units', W, scoped(async c=>{c.status=201;return await inv.addUnits(ctx,c.user,id(c),c.body);},'item'));
  router.add('PUT', '/api/units/:id', W, scoped(c=>inv.updateUnit(ctx,c.user,id(c),c.body),'unit'));
  router.add('DELETE', '/api/units/:id', W, scoped(c=>inv.deleteUnit(ctx,c.user,id(c)),'unit'));
  router.add('POST', '/api/uploads/photo', { perm:'inventory:write',raw:MAX_PHOTO_BYTES }, scoped(async c=>{c.status=201;return {photo:await savePhoto(ctx.cfg,c.rawBody)};}));
}
