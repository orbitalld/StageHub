// Registro de cambios: quién hizo qué y cuándo.
export async function audit(db, user, action, entity, entityId, summary, details = null) {
  (await db.prepare(`INSERT INTO audit_log(user_id, username, action, entity, entity_id, summary, details, company_id)
              VALUES (?,?,?,?,?,?,?,?)`).run(
    user?.id ?? null, (user?.email ? user.full_name : user?.username) ?? null, action, entity, entityId ?? null, summary,
    details ? JSON.stringify(details) : null, user?.company_id ?? null,
  ));
}
