import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildConfig } from '../server/config.js';
import { createApp } from '../server/app.js';
import { createUser } from '../server/users.js';
import { openDb, migrate } from '../server/db.js';
import { LOGO_RE, MAX_LOGO_BYTES } from '../server/services/photos.js';
import { compileSql } from '../server/postgres.js';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=','base64');
const password='clave-segura-123';
test('logos: solo Master escribe; lectura autenticada, validación, reemplazo, separación y persistencia',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stagehub-logos-'));const cfg=buildConfig({dataDir:dir,databaseUrl:'',port:0});let app,base;const cookies={};
 async function start(){app=await createApp(cfg);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;}
 async function call(who,method,url,body){const raw=Buffer.isBuffer(body);const r=await fetch(base+url,{method,headers:{'X-Requested-With':'stagehub','Content-Type':raw?'image/png':'application/json',...(cookies[who]?{Cookie:cookies[who]}:{})},body:raw?body:body===undefined?undefined:JSON.stringify(body)});const sc=r.headers.get('set-cookie');if(sc)cookies[who]=sc.split(';')[0];const result=r.headers.get('content-type')?.startsWith('image/')?Buffer.from(await r.arrayBuffer()):await r.json();return {status:r.status,result,headers:r.headers};}
 try{
  await start();assert.equal((await call('master','POST','/api/auth/setup',{username:'master',full_name:'Master',password})).status,201);
  for(const [who,role] of [['admin','bodega'],['reader','consulta']]){await createUser(app.db,{username:who,full_name:who,role,password});assert.equal((await call(who,'POST','/api/auth/login',{username:who,password})).status,200);}
  const b=(await call('master','POST','/api/companies',{name:'Segunda'})).result.id;
  for(const [who,status] of [['anon',401],['reader',403],['admin',403]]){assert.equal((await call(who,'POST','/api/companies/1/logo',png)).status,status);assert.equal((await call(who,'DELETE','/api/companies/1/logo')).status,status);}
  assert.equal((await call('master','POST','/api/companies/999/logo',png)).status,404);
  assert.equal((await call('master','POST','/api/companies/1/logo',Buffer.from('<svg>bad</svg>'))).status,415);
  assert.equal((await call('master','POST','/api/companies/1/logo',Buffer.alloc(MAX_LOGO_BYTES+1))).status,413);
  const uploaded=await call('master','POST','/api/companies/1/logo',png);assert.equal(uploaded.status,200);const logo=uploaded.result.logo;assert.match(logo,LOGO_RE);
  assert.equal((await call('anon','GET',`/uploads/${logo}`)).status,401);
  for(const who of ['reader','admin','master']){const served=await call(who,'GET',`/uploads/${logo}`);assert.equal(served.status,200);assert.deepEqual(served.result,png);assert.match(served.headers.get('cache-control'),/no-store/);const rows=(await call(who,'GET','/api/companies')).result;assert.equal(rows.find(c=>c.id===1).logo,logo);assert.equal(rows.find(c=>c.id===b).logo,null);}
  const cat=(await call('admin','GET','/api/categories')).result[0];assert.equal((await call('admin','POST','/api/items',{name:'No debe usar logo',category_id:cat.id,photo:logo})).status,422);
  // Edición de campos generales no puede cambiar el logo, incluso con una ruta suministrada.
  assert.equal((await call('master','PUT','/api/companies/1',{name:'Renombrada',logo:null})).result.logo,logo);
  const other=(await call('master','POST',`/api/companies/${b}/logo`,png)).result.logo;assert.notEqual(other,logo);
  const next=(await call('master','POST','/api/companies/1/logo',png)).result.logo;assert.notEqual(next,logo);assert.equal(fs.existsSync(path.join(cfg.uploadsDir,logo)),false);assert.equal((await call('reader','GET',`/uploads/${logo}`)).status,404);
  await app.close();app=null;await start();assert.equal((await call('reader','GET',`/uploads/${next}`)).status,200);
  assert.equal((await call('master','DELETE','/api/companies/1/logo')).result.logo,null);assert.equal(fs.existsSync(path.join(cfg.uploadsDir,next)),false);assert.equal((await call('reader','GET',`/uploads/${next}`)).status,404);assert.equal((await call('reader','GET',`/uploads/${other}`)).status,200);
  assert.equal(app.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE entity='company' AND summary LIKE 'Logo %'").get().n,4);
 }finally{if(app)await app.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('migración 0.4.1 a 0.4.2 mantiene empresas y agrega logo opcional; SQL PostgreSQL parametrizado',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stagehub-logos-migration-'));const cfg=buildConfig({dataDir:dir,databaseUrl:''});const old=path.join(dir,'old');fs.mkdirSync(old);const db=openDb(cfg.dbFile);
 try{for(const file of fs.readdirSync(cfg.migrationsDir).filter(f=>!f.startsWith('005')))fs.copyFileSync(path.join(cfg.migrationsDir,file),path.join(old,file));migrate(db,old);db.prepare('UPDATE companies SET name=? WHERE id=1').run('Empresa existente');assert.deepEqual(migrate(db,cfg.migrationsDir),['005_company_logos.sql']);assert.equal(db.prepare('SELECT name,logo FROM companies WHERE id=1').get().name,'Empresa existente');assert.equal(db.prepare('SELECT logo FROM companies WHERE id=1').get().logo,null);assert.deepEqual(migrate(db,cfg.migrationsDir),[]);assert.deepEqual(compileSql('UPDATE companies SET logo=? WHERE id=?',['logo-test.png',1],'run'),{text:'UPDATE companies SET logo=$1 WHERE id=$2',values:['logo-test.png',1]});assert.match(fs.readFileSync(cfg.postgresSchema,'utf8'),/ALTER TABLE stagehub\.companies ADD COLUMN IF NOT EXISTS logo text/);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
