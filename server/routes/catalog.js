import * as cat from '../services/catalog.js';

export function registerCatalogRoutes(router, { db }) {
  const W = { perm: 'categories:write' };
  router.add('GET', '/api/categories', { perm: 'inventory:read' }, async () => (await cat.listCatalog(db)));
  router.add('POST', '/api/categories', W, async (c) => { c.status = 201; return { id: (await cat.createCategory(db, c.user, c.body)) }; });
  router.add('PUT', '/api/categories/:id', W, async (c) => { (await cat.updateCategory(db, c.user, Number(c.params.id), c.body)); return { ok: true }; });
  router.add('DELETE', '/api/categories/:id', W, async (c) => { (await cat.deleteCategory(db, c.user, Number(c.params.id))); c.status = 204; });
  router.add('POST', '/api/categories/:id/subcategories', W, async (c) => {
    c.status = 201;
    return { id: (await cat.createSubcategory(db, c.user, Number(c.params.id), c.body)) };
  });
  router.add('PUT', '/api/subcategories/:id', W, async (c) => { (await cat.updateSubcategory(db, c.user, Number(c.params.id), c.body)); return { ok: true }; });
  router.add('DELETE', '/api/subcategories/:id', W, async (c) => { (await cat.deleteSubcategory(db, c.user, Number(c.params.id))); c.status = 204; });
}
