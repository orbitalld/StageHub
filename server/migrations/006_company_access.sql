-- Acceso explícito por empresa; ningún usuario histórico recibe acceso implícito.
CREATE TABLE company_members (
 company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 member_role TEXT NOT NULL CHECK(member_role IN ('reader','inventory','members','manager','owner')),
 PRIMARY KEY(company_id,user_id)
);
CREATE TABLE company_invitations (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 member_role TEXT NOT NULL CHECK(member_role IN ('reader','inventory','members','manager')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled')),
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX company_inv_pending ON company_invitations(company_id,recipient_id) WHERE status='pending';
CREATE INDEX company_members_user ON company_members(user_id);
CREATE INDEX company_inv_recipient ON company_invitations(recipient_id,status);
CREATE TABLE company_photo_uploads (photo TEXT PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE);
