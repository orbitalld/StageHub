CREATE TABLE events (
 id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
 name TEXT NOT NULL, client TEXT, location TEXT, responsible TEXT, crew TEXT, description TEXT, notes TEXT,
 departure TEXT NOT NULL, setup_at TEXT, start_at TEXT NOT NULL, end_at TEXT NOT NULL, teardown_at TEXT, return_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','planning','confirmed','setup','running','teardown','return_pending','finished','cancelled')),
 created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, deleted_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 CHECK(departure<=start_at AND start_at<end_at AND end_at<=return_at AND departure<return_at)
);
CREATE INDEX idx_events_company_dates ON events(company_id,departure,return_at);
CREATE TABLE event_permissions (
 company_id INTEGER NOT NULL, user_id INTEGER NOT NULL, permissions TEXT NOT NULL,
 PRIMARY KEY(company_id,user_id), FOREIGN KEY(company_id,user_id) REFERENCES company_members(company_id,user_id) ON DELETE CASCADE
);
CREATE TABLE event_lines (
 id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT, requested INTEGER NOT NULL CHECK(requested>0),
 selected_units TEXT NOT NULL DEFAULT '[]', state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','pending','rejected','approved','reserved','released')),
 approved_qty INTEGER NOT NULL DEFAULT 0 CHECK(approved_qty>=0 AND approved_qty<=requested),
 notes TEXT, UNIQUE(event_id,item_id)
);
CREATE INDEX idx_event_lines_item ON event_lines(item_id,state);
CREATE TABLE event_pieces (
 id INTEGER PRIMARY KEY, line_id INTEGER NOT NULL REFERENCES event_lines(id) ON DELETE CASCADE,
 unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','prepared','loaded','delivered','installed','dismantled','returned','damaged','lost','released')),
 notes TEXT, updated_at TEXT NOT NULL, UNIQUE(line_id,unit_id)
);
CREATE INDEX idx_event_pieces_line ON event_pieces(line_id,status);
