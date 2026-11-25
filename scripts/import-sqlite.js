// Importa un respaldo SQLite de StageHub Fase 1 a una base Supabase vacía, ANTES de desplegar.
import fs from 'node:fs';
import path from 'node:path';
import { buildConfig } from '../server/config.js';
import { openDb, migrate, openConfiguredDb, withDb, tx } from '../server/db.js';
import { checkStorage, putPhoto } from '../server/storage.js';
import { PHOTO_RE } from '../server/services/photos.js';
const src=process.argv[2];const cfg=buildConfig();
if(!src || !cfg.databaseUrl){console.error('Uso: npm run import-sqlite -- <carpeta con stagehub.db y uploads> (configura .env antes)');process.exit(1);}
const root=path.resolve(src);const file=path.join(root,'stagehub.db');
if(!fs.existsSync(file)){console.error('No existe stagehub.db en esa carpeta');process.exit(1);}
const tables=['users','companies','categories','subcategories','items','units','audit_log','stock_snapshots','company_stock_snapshots','settings','counters'];
const ids=new Set(['users','categories','subcategories','items','units','audit_log','companies']);
let local,db;
try {
  local=openDb(file);migrate(local,cfg.migrationsDir,{backupDir:path.join(root,'backups')});
  const data=Object.fromEntries(tables.map(t=>[t,local.prepare(`SELECT * FROM ${t}`).all()]));
  if(!data.users.length)throw new Error('El respaldo no tiene usuarios. Para instalación nueva no necesitas importar.');
  await checkStorage(cfg);db=await openConfiguredDb(cfg);
  await withDb(db,async()=>{
    for(const t of tables.filter(t=>t!=='companies'))if((await db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()).n)throw new Error('La base de destino no está vacía. No se sobrescribirá.');
    if((await db.prepare('SELECT COUNT(*) AS n FROM companies WHERE id<>1').get()).n)throw new Error('El destino ya contiene empresas.');
    for(const n of new Set(data.items.map(i=>i.photo).filter(Boolean))){if(!PHOTO_RE.test(n)||!fs.existsSync(path.join(root,'uploads',n)))throw new Error(`Foto ausente o inválida: ${n}`);}
    // Las fotos se transfieren primero. En caso de interrupción revisa el bucket antes de repetir.
    for(const n of new Set(data.items.map(i=>i.photo).filter(Boolean))) await putPhoto(cfg,n,fs.readFileSync(path.join(root,'uploads',n)));
    await tx(db,async()=>{
      for(const t of tables){for(const row of data[t]){
        if(t==='users')row.active=Boolean(row.active);
        const cols=Object.keys(row);if(!cols.every(k=>/^[a-z_]+$/.test(k)))throw new Error('Columna inválida');
        const conflict=t==='companies'?' ON CONFLICT(id) DO UPDATE SET name=excluded.name,rut=excluded.rut,contact=excluded.contact,notes=excluded.notes,created_at=excluded.created_at':'';
        await db.prepare(`INSERT INTO ${t}(${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})${conflict}`).run(...cols.map(k=>row[k]));
      }if(ids.has(t))await db.exec(`SELECT setval(pg_get_serial_sequence('stagehub.${t}','id'),COALESCE(MAX(id),1),COUNT(*)>0) FROM ${t}`);}
    });
  });
  console.log('Importación completada. Usa tus usuarios anteriores; las sesiones se crean nuevamente.');
}catch(e){console.error('Importación detenida:',e.code||e.message);process.exitCode=1;}finally{if(local)local.close();if(db)await db.close();}
