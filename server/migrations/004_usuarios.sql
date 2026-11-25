-- Nuevos roles sin reconstruir users ni romper referencias históricas.
ALTER TABLE users ADD COLUMN access_role TEXT CHECK (access_role IN ('user','admin','master'));
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN email_verified_at TEXT;
ALTER TABLE users ADD COLUMN verification_hash TEXT;
ALTER TABLE users ADD COLUMN verification_expires_at TEXT;
ALTER TABLE users ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending','approved','rejected'));
ALTER TABLE users ADD COLUMN verification_required INTEGER NOT NULL DEFAULT 0 CHECK (verification_required IN (0,1));
UPDATE users SET access_role=CASE role WHEN 'admin' THEN 'master' WHEN 'bodega' THEN 'admin' ELSE 'user' END;
CREATE UNIQUE INDEX uq_users_email_ci ON users(lower(email));
