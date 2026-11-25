import os from 'node:os';
import { buildConfig } from './config.js';
import { createApp } from './app.js';
import { createBackup } from './backup.js';

const cfg = buildConfig();
let app;
try { app=await createApp(cfg); }
catch(e){console.error('[inicio] '+(e.code||e.message).replace(/postgres(?:ql)?:\/\/[^\s]+/gi,'[URL oculta]'));process.exit(1);}

app.server.listen(cfg.port, cfg.host, () => {
  console.log('\nStageHub en marcha. Direcciones de acceso:');
  console.log(`  Este equipo:        http://localhost:${cfg.port}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) if (n.family === 'IPv4' && !n.internal) console.log(`  Red local (móvil):  http://${n.address}:${cfg.port}`);
  }
  console.log(cfg.databaseUrl ? "\nDatos: Supabase PostgreSQL + Storage\n" : `\nDatos en: ${cfg.dataDir}\nCtrl+C para detener.\n`);
});

// Copia automática diaria mientras el servidor esté encendido (se conservan las últimas 14).
// En la Fase 5 se reemplaza por el módulo de respaldos configurable desde la interfaz.
import fs from 'node:fs';
import path from 'node:path';
function dailyBackup() {
  try {
    const dir = createBackup(cfg, app.db);
    const all = fs.readdirSync(cfg.backupsDir).filter((f) => f.startsWith('respaldo-')).sort();
    for (const old of all.slice(0, Math.max(0, all.length - 14))) fs.rmSync(path.join(cfg.backupsDir, old), { recursive: true, force: true });
    console.log(`[respaldo] ${dir}`);
  } catch (e) { console.error('[respaldo] falló:', e.message); }
}
if(!cfg.databaseUrl){setTimeout(dailyBackup, 30_000).unref();
setInterval(dailyBackup, 24 * 3600_000).unref();}

const stop = async () => { console.log('\nCerrando...'); await app.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
