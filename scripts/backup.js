// Respaldo local o exportación de datos y fotos de Supabase (ejecutar en tu propio PC).
import fs from 'node:fs';
import path from 'node:path';
import { buildConfig } from '../server/config.js';
import { openConfiguredDb, withDb, tx } from '../server/db.js';
import { createBackup } from '../server/backup.js';
import { getPhoto, checkStorage } from '../server/storage.js';
import { PHOTO_RE } from '../server/services/photos.js';
const cfg=buildConfig();let db;
try {
  db=await openConfiguredDb(cfg);
  if(!cfg.databaseUrl) console.log('Respaldo creado en:',createBackup(cfg,db));
  else {
    await checkStorage(cfg);
    const dir=path.join(cfg.backupsDir,'supabase-'+new Date().toISOString().replace(/[:.]/g,'-'));
    fs.mkdirSync(path.join(dir,'uploads'),{recursive:true,mode:0o700});
    await withDb(db,async()=>{
      const data=await tx(db,async()=>{
        await db.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
        const tables=['users','companies','categories','subcategories','items','units','audit_log','stock_snapshots','company_stock_snapshots','settings','counters'];
        const result={}; for(const t of tables)result[t]=await db.prepare(`SELECT * FROM ${t}`).all();return result;
      });
      fs.writeFileSync(path.join(dir,'database.json'),JSON.stringify({format:'stagehub-postgres-v1',exportedAt:new Date().toISOString(),tables:data},null,2),{mode:0o600});
      for(const name of new Set(data.items.map(i=>i.photo).filter(n=>n&&PHOTO_RE.test(n))))fs.writeFileSync(path.join(dir,'uploads',name),await getPhoto(cfg,name),{mode:0o600});
    });
    fs.writeFileSync(path.join(dir,'COMPLETO.txt'),'Exportación terminada. Contiene hashes de contraseña: mantener privada. No incluye sesiones.\n');
    console.log('Exportación creada en:',dir);
  }
}catch(e){console.error('Respaldo incompleto:',e.code||e.message);process.exitCode=1;}finally{if(db)await db.close();}
