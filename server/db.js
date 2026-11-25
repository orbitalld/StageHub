// Acceso a SQLite (módulo integrado de Node), migraciones y transacciones.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode = WAL;
           PRAGMA foreign_keys = ON;
           PRAGMA busy_timeout = 5000;
           PRAGMA synchronous = NORMAL;`);
  return db;
}

const depth = new WeakMap();

/** Ejecuta fn dentro de una transacción (admite anidamiento con SAVEPOINT). */
function syncTx(db, fn) {
  const d = depth.get(db) || 0;
  const sp = `sp_${d}`;
  db.exec(d === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${sp}`);
  depth.set(db, d + 1);
  try {
    const result = fn();
    depth.set(db, d);
    db.exec(d === 0 ? 'COMMIT' : `RELEASE ${sp}`);
    return result;
  } catch (err) {
    depth.set(db, d);
    db.exec(d === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
    throw err;
  }
}

/**
 * Aplica en orden los archivos .sql de /migrations que aún no estén registrados.
 * Si ya existían datos, hace una copia de seguridad automática antes de migrar.
 */
export function migrate(db, dir, { backupDir } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const pending = files.filter((f) => !applied.has(f));
  if (!pending.length) return [];

  if (applied.size > 0 && backupDir) {
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    db.exec(`VACUUM INTO '${path.join(backupDir, `pre-migracion-${stamp}.db`).replace(/'/g, "''")}'`);
  }
  for (const f of pending) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    syncTx(db, () => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations(version) VALUES (?)').run(f);
    });
  }
  return pending;
}

// Las operaciones de aplicación son asíncronas en ambos motores; migraciones SQLite conservan su tx síncrona.
export async function tx(db, fn) {
  const d=depth.get(db)||0, sp=`sp_${d}`;
  await db.exec(d===0 ? (db.dialect==='postgres'?'BEGIN':'BEGIN IMMEDIATE') : `SAVEPOINT ${sp}`);
  depth.set(db,d+1);
  try { const result=await fn(); await db.exec(d===0?'COMMIT':`RELEASE SAVEPOINT ${sp}`); return result; }
  catch(err) { try { await db.exec(d===0?'ROLLBACK':`ROLLBACK TO SAVEPOINT ${sp}; RELEASE SAVEPOINT ${sp}`); } catch(e){console.error('Rollback:',e.message);} throw err; }
  finally { depth.set(db,d); }
}

export async function openConfiguredDb(cfg){
  if(cfg.databaseUrl){ const {openPostgres,migratePostgres}=await import('./postgres.js'); const db=await openPostgres(cfg);
    try { await db.scope(()=>migratePostgres(db,cfg)); return db; } catch(e){ await db.close(); throw e; }
  }
  const db=openDb(cfg.dbFile); migrate(db,cfg.migrationsDir,{backupDir:cfg.backupsDir}); return db;
}
export function withDb(db,fn){ return db.scope?db.scope(fn):fn(); }
