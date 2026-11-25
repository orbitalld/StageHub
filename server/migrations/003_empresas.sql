CREATE TABLE companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  rut TEXT, contact TEXT, notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO companies(id,name) VALUES (1,'Empresa principal');
ALTER TABLE items ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE RESTRICT;
UPDATE items SET company_id=1;
CREATE TRIGGER items_company_required_insert AFTER INSERT ON items WHEN NEW.company_id IS NULL BEGIN
  UPDATE items SET company_id=1 WHERE id=NEW.id;
END;
CREATE TRIGGER items_company_required_update BEFORE UPDATE OF company_id ON items WHEN NEW.company_id IS NULL BEGIN
  SELECT RAISE(ABORT,'company_id required');
END;
CREATE INDEX idx_items_company ON items(company_id);
ALTER TABLE audit_log ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE RESTRICT;
UPDATE audit_log SET company_id=1 WHERE entity IN ('item','unit');
CREATE INDEX idx_audit_company ON audit_log(company_id,id);
CREATE TABLE company_stock_snapshots (
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  day TEXT NOT NULL, total INTEGER NOT NULL, available INTEGER NOT NULL,
  maintenance INTEGER NOT NULL, out_of_service INTEGER NOT NULL,
  PRIMARY KEY(company_id,day)
);
INSERT INTO company_stock_snapshots(company_id,day,total,available,maintenance,out_of_service)
SELECT 1,day,total,available,maintenance,out_of_service FROM stock_snapshots;
