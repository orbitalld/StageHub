import { dashboard } from '../services/inventory.js';

export function registerDashboardRoutes(router, { db }) {
  router.add('GET', '/api/dashboard', { perm: 'inventory:read' }, async () => (await dashboard(db)));

  router.add('GET', '/api/audit', { perm: 'audit:read' }, async (c) => {
    const limit = Math.min(Math.max(parseInt(c.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(c.query.offset, 10) || 0, 0);
    const rows = (await db.prepare(`SELECT id, ts, username, action, entity, entity_id, summary FROM audit_log
                             ORDER BY id DESC LIMIT ? OFFSET ?`).all(limit, offset)).map((r) => ({ ...r }));
    return { entries: rows, total: (await db.prepare('SELECT COUNT(*) AS n FROM audit_log').get()).n };
  });
}
