// Configuración central. Todo se puede sobrescribir con variables de entorno.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function buildConfig(overrides = {}) {
  const dataDir = path.resolve(overrides.dataDir || process.env.DATA_DIR || path.join(root, 'data'));
  return {
    root,
    databaseUrl: overrides.databaseUrl ?? process.env.DATABASE_URL ?? '',
    databaseCa: process.env.SUPABASE_DB_CA || '',
    pgNoTls: process.env.PG_NO_TLS === '1' && process.env.RENDER !== 'true',
    postgresSchema: path.join(root,'supabase','migrations','202611250001_stagehub_schema.sql'),
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'stagehub-photos',
    adminUsername: process.env.ADMIN_USERNAME || 'admin',
    adminName: process.env.ADMIN_NAME || 'Administrador',
    adminPassword: process.env.ADMIN_PASSWORD || '',

    port: Number(overrides.port ?? process.env.PORT ?? 3000),
    host: overrides.host || process.env.HOST || '0.0.0.0',
    dataDir,
    dbFile: path.join(dataDir, 'stagehub.db'),
    uploadsDir: path.join(dataDir, 'uploads'),
    backupsDir: path.join(dataDir, 'backups'),
    publicDir: path.join(root, 'public'),
    migrationsDir: path.join(root, 'server', 'migrations'),
    sessionDays: Number(process.env.SESSION_DAYS || 30),
    // Activar (SECURE_COOKIES=1) cuando se publique detrás de HTTPS.
    secureCookies: process.env.SECURE_COOKIES === '1' || process.env.RENDER === 'true',
  };
}
