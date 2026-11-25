-- Papelera reversible: no se eliminan físicamente empresas ni sus dependencias.
ALTER TABLE companies ADD COLUMN deleted_at TEXT;
ALTER TABLE companies ADD COLUMN deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_companies_deleted ON companies(deleted_at);
