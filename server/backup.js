// Copia de seguridad consistente: base de datos (VACUUM INTO) + fotografías.
import fs from 'node:fs';
import path from 'node:path';

export function createBackup(cfg, db) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(cfg.backupsDir, `respaldo-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  db.exec(`VACUUM INTO '${path.join(dir, 'stagehub.db').replace(/'/g, "''")}'`);
  if (fs.existsSync(cfg.uploadsDir)) fs.cpSync(cfg.uploadsDir, path.join(dir, 'uploads'), { recursive: true });
  return dir;
}
