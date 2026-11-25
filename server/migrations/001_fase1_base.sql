-- FASE 1: usuarios, sesiones, catálogo dinámico, inventario, auditoría.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name     TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','bodega','supervisor','tecnico','consulta')),
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,               -- SHA-256 del token (el token real solo vive en la cookie)
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT NOT NULL,
  ip           TEXT,
  user_agent   TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE categories (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color         TEXT NOT NULL DEFAULT '#5b8cff',
  tracking_mode TEXT NOT NULL DEFAULT 'individual' CHECK (tracking_mode IN ('individual','cantidad')),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE subcategories (
  id            INTEGER PRIMARY KEY,
  category_id   INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name          TEXT NOT NULL COLLATE NOCASE,
  tracking_mode TEXT NOT NULL DEFAULT 'individual' CHECK (tracking_mode IN ('individual','cantidad')),
  spec_template TEXT NOT NULL DEFAULT '[]',     -- JSON: claves sugeridas de características (ej. Ancho, Largo)
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (category_id, name)
);

CREATE TABLE items (
  id                 INTEGER PRIMARY KEY,
  internal_code      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name               TEXT NOT NULL,
  category_id        INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  subcategory_id     INTEGER REFERENCES subcategories(id) ON DELETE RESTRICT,
  brand              TEXT,
  model              TEXT,
  tracking_mode      TEXT NOT NULL CHECK (tracking_mode IN ('individual','cantidad')),
  -- Solo se usan cuando tracking_mode = 'cantidad'. En modo 'individual' manda la tabla units.
  qty_total          INTEGER NOT NULL DEFAULT 0 CHECK (qty_total >= 0),
  qty_maintenance    INTEGER NOT NULL DEFAULT 0 CHECK (qty_maintenance >= 0),
  qty_out_of_service INTEGER NOT NULL DEFAULT 0 CHECK (qty_out_of_service >= 0),
  min_stock          INTEGER NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  unit_seq           INTEGER NOT NULL DEFAULT 0,  -- correlativo para códigos de unidad
  location           TEXT,
  acquisition_date   TEXT,
  acquisition_price  REAL CHECK (acquisition_price IS NULL OR acquisition_price >= 0),
  supplier           TEXT,
  photo              TEXT,
  description        TEXT,
  notes              TEXT,
  specs              TEXT NOT NULL DEFAULT '[]',  -- JSON [{key,value}]
  accessories        TEXT NOT NULL DEFAULT '[]',  -- JSON [string]
  created_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (qty_maintenance + qty_out_of_service <= qty_total)
);
CREATE INDEX idx_items_category ON items(category_id);
CREATE INDEX idx_items_subcategory ON items(subcategory_id);
CREATE INDEX idx_items_name ON items(name);

CREATE TABLE units (
  id            INTEGER PRIMARY KEY,
  item_id       INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  unit_code     TEXT NOT NULL UNIQUE,
  serial_number TEXT,
  qr_token      TEXT NOT NULL UNIQUE,            -- identificador opaco que irá dentro del QR (Fase 3)
  status        TEXT NOT NULL DEFAULT 'disponible' CHECK (status IN ('disponible','mantenimiento','fuera_de_servicio')),
  location      TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_units_item_status ON units(item_id, status);
CREATE UNIQUE INDEX uq_units_serial ON units(item_id, serial_number COLLATE NOCASE) WHERE serial_number IS NOT NULL;

-- Existencias base por equipo, calculadas siempre desde los datos (nunca duplicadas).
-- En Fase 2 la disponibilidad por fechas restará las reservas a "available".
CREATE VIEW v_item_stock AS
SELECT i.id AS item_id,
  CASE WHEN i.tracking_mode = 'individual' THEN COALESCE(u.total, 0) ELSE i.qty_total END AS total,
  CASE WHEN i.tracking_mode = 'individual' THEN COALESCE(u.maint, 0) ELSE i.qty_maintenance END AS maintenance,
  CASE WHEN i.tracking_mode = 'individual' THEN COALESCE(u.oos, 0) ELSE i.qty_out_of_service END AS out_of_service,
  CASE WHEN i.tracking_mode = 'individual' THEN COALESCE(u.avail, 0)
       ELSE MAX(i.qty_total - i.qty_maintenance - i.qty_out_of_service, 0) END AS available
FROM items i
LEFT JOIN (
  SELECT item_id, COUNT(*) AS total,
         SUM(status = 'mantenimiento') AS maint,
         SUM(status = 'fuera_de_servicio') AS oos,
         SUM(status = 'disponible') AS avail
  FROM units GROUP BY item_id
) u ON u.item_id = i.id;

CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY,
  ts         TEXT NOT NULL DEFAULT (datetime('now')),
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username   TEXT,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  INTEGER,
  summary    TEXT NOT NULL,
  details    TEXT
);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);
CREATE INDEX idx_audit_ts ON audit_log(ts);

-- Foto diaria del inventario para el gráfico de evolución.
CREATE TABLE stock_snapshots (
  day            TEXT PRIMARY KEY,
  total          INTEGER NOT NULL,
  available      INTEGER NOT NULL,
  maintenance    INTEGER NOT NULL,
  out_of_service INTEGER NOT NULL
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0);
