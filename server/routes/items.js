import * as inv from '../services/inventory.js';
import { savePhoto, MAX_PHOTO_BYTES } from '../services/photos.js';

export function registerItemRoutes(router, ctx) {
  const { db } = ctx;
  const R = { perm: 'inventory:read' };
  const W = { perm: 'inventory:write' };
  const id = (c) => Number(c.params.id);

  router.add('GET', '/api/items', R, async (c) => (await inv.listItems(db, c.query)));
  router.add('POST', '/api/items', W, async (c) => { c.status = 201; return (await inv.createItem(ctx, c.user, c.body)); });
  router.add('GET', '/api/items/:id', R, async (c) => (await inv.getItem(db, id(c))));
  router.add('PUT', '/api/items/:id', W, async (c) => (await inv.updateItem(ctx, c.user, id(c), c.body)));
  router.add('DELETE', '/api/items/:id', W, async (c) => { (await inv.deleteItem(ctx, c.user, id(c))); c.status = 204; });
  router.add('POST', '/api/items/:id/duplicate', W, async (c) => { c.status = 201; return (await inv.duplicateItem(ctx, c.user, id(c))); });
  router.add('GET', '/api/items/:id/history', R, async (c) => (await inv.itemHistory(db, id(c))));

  router.add('POST', '/api/items/:id/units', W, async (c) => { c.status = 201; return (await inv.addUnits(ctx, c.user, id(c), c.body)); });
  router.add('PUT', '/api/units/:id', W, async (c) => (await inv.updateUnit(ctx, c.user, id(c), c.body)));
  router.add('DELETE', '/api/units/:id', W, async (c) => (await inv.deleteUnit(ctx, c.user, id(c))));

  router.add('POST', '/api/uploads/photo', { perm: 'inventory:write', raw: MAX_PHOTO_BYTES }, async (c) => {
    c.status = 201;
    return { photo: (await savePhoto(ctx.cfg, c.rawBody)) };
  });
}
