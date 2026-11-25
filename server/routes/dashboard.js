import { selectedCompany } from './companies.js';
import { can, effectiveRole } from '../permissions.js';
import { dashboard } from '../services/inventory.js';

export function registerDashboardRoutes(router, { db }) {
  router.add('GET', '/api/dashboard', {}, async c => (await dashboard(db,await selectedCompany(db,c))));

  router.add('GET', '/api/audit', {}, async (c) => {
    const companyId=await selectedCompany(db,c,'audit:read');
    const limit = Math.min(Math.max(parseInt(c.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(c.query.offset, 10) || 0, 0);
    const where = can(effectiveRole(c.user),'users:write')?'(company_id=? OR company_id IS NULL)':'company_id=?';
    const rows = (await db.prepare(`SELECT id, ts, username, action, entity, entity_id, summary FROM audit_log
                             WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(companyId,limit, offset)).map((r) => ({ ...r }));
    return { entries: rows, total: (await db.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE ${where}`).get(companyId)).n };
  });
}
