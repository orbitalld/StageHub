import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildConfig } from '../server/config.js';
import { createApp } from '../server/app.js';
import { createUser } from '../server/users.js';
import { openDb, migrate } from '../server/db.js';
import { compileSql } from '../server/postgres.js';

test('migración de inventario previo asigna empresas sin perder equipos, unidades, historial o evolución',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stagehub-co-migration-'));
 const cfg=buildConfig({dataDir:dir,databaseUrl:''});const old=path.join(dir,'old');fs.mkdirSync(old);
 for(const file of ['001_fase1_base.sql','002_numeracion_y_notas_estado.sql'])fs.copyFileSync(path.join(cfg.migrationsDir,file),path.join(old,file));
 const db=openDb(cfg.dbFile);
 try{migrate(db,old);db.exec(`INSERT INTO categories(name) VALUES ('Test'); INSERT INTO items(internal_code,name,category_id,tracking_mode) VALUES ('TEST-1','Equipo antiguo',1,'individual'); INSERT INTO units(item_id,unit_code,qr_token,unit_number) VALUES (1,'TEST-1-001','qr-old',1); INSERT INTO audit_log(action,entity,entity_id,summary) VALUES ('crear','item',1,'Antes de migrar'); INSERT INTO stock_snapshots(day,total,available,maintenance,out_of_service) VALUES ('2026-10-01',1,1,0,0);`);
 assert.deepEqual(migrate(db,cfg.migrationsDir),['003_empresas.sql','004_usuarios.sql','005_company_logos.sql']);assert.equal(db.prepare('SELECT company_id FROM items').get().company_id,1);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM units').get().n,1);assert.equal(db.prepare('SELECT company_id FROM audit_log').get().company_id,1);assert.equal(db.prepare('SELECT total FROM company_stock_snapshots').get().total,1);assert.deepEqual(migrate(db,cfg.migrationsDir),[]);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('API de empresas: separación, permisos, inventario, unidades, historial, traslado y persistencia',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stagehub-co-api-'));const cfg=buildConfig({dataDir:dir,databaseUrl:'',port:0});let app;let base;const cookies={};
 async function start(){app=await createApp(cfg);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;}
 async function call(method,url,body,company=1,who='admin'){const headers={'X-Requested-With':'stagehub','X-StageHub-Company':String(company),'Content-Type':'application/json'};if(cookies[who])headers.Cookie=cookies[who];const r=await fetch(base+url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});if(r.headers.get('set-cookie'))cookies[who]=r.headers.get('set-cookie').split(';')[0];return {status:r.status,json:r.status===204?null:await r.json()};}
 try{await start();assert.equal((await call('GET','/api/companies',undefined,1,'anon')).status,401);assert.equal((await call('POST','/api/auth/setup',{username:'admin',full_name:'Admin',password:'clave-segura-123'})).status,201);
 await createUser(app.db,{username:'lector',full_name:'Lector',role:'consulta',password:'clave-segura-123'});await call('POST','/api/auth/login',{username:'lector',password:'clave-segura-123'},1,'reader');
 assert.equal((await call('POST','/api/companies',{name:'No autorizado'},1,'reader')).status,403);
 assert.equal((await call('PUT','/api/companies/1',{name:'Orbital'})).status,200);
 const company=await call('POST','/api/companies',{name:'Segunda',rut:'123'});assert.equal(company.status,201);const b=company.json.id;
 assert.equal((await call('POST','/api/companies',{name:'segunda'})).status,409);
 const cat=(await call('GET','/api/categories')).json[0];
 const aItem=await call('POST','/api/items',{name:'Beam A',category_id:cat.id,tracking_mode:'individual',initial_units:3,company_id:b});assert.equal(aItem.status,201);assert.equal(aItem.json.company_id,1);
 const bItem=await call('POST','/api/items',{name:'Cable B',category_id:cat.id,tracking_mode:'cantidad',qty_total:7},b);assert.equal(bItem.status,201);const id=aItem.json.id,unit=aItem.json.units[0].id;
 assert.equal((await call('GET','/api/items')).json.total,1);assert.equal((await call('GET','/api/items?company_id=1',undefined,b)).json.items[0].id,bItem.json.id);
 for(const [method,url,body] of [['GET',`/api/items/${id}`],['PUT',`/api/items/${id}`,{}],['DELETE',`/api/items/${id}`],['GET',`/api/items/${id}/history`],['POST',`/api/items/${id}/duplicate`,{}],['POST',`/api/items/${id}/units`,{count:1}],['PUT',`/api/units/${unit}`,{}],['DELETE',`/api/units/${unit}`]])assert.equal((await call(method,url,body,b)).status,404,url);
 assert.equal((await call('GET','/api/dashboard')).json.totals.total,3);assert.equal((await call('GET','/api/dashboard',undefined,b)).json.totals.total,7);
 assert.equal((await call('GET','/api/items',undefined,999)).status,404);
 assert.equal((await call('POST',`/api/items/${id}/transfer`,{company_id:b},1,'reader')).status,403);
 const moved=await call('POST',`/api/items/${id}/transfer`,{company_id:b});assert.equal(moved.status,200);assert.equal(moved.json.company_id,b);assert.equal(moved.json.units[0].id,unit);assert.equal(moved.json.stock.total,3);
 assert.equal((await call('GET','/api/items')).json.total,0);assert.equal((await call('GET','/api/dashboard',undefined,b)).json.totals.total,10);assert.ok((await call('GET',`/api/items/${id}/history`,undefined,b)).json.some(r=>r.action==='crear'));
 await app.close();app=null;await start();assert.equal((await call('GET','/api/companies')).json.length,2);assert.equal((await call('GET','/api/dashboard',undefined,b)).json.totals.total,10);assert.equal((await call('GET','/api/dashboard')).json.totals.total,0);
 }finally{if(app)await app.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('PostgreSQL devuelve ID de empresa y compila snapshot compuesto',()=>{
 assert.match(compileSql('INSERT INTO companies(name) VALUES (?)',['Test'],'run').text,/RETURNING id$/);
 assert.match(compileSql("INSERT INTO company_stock_snapshots(company_id,day,total,available,maintenance,out_of_service) VALUES (?,date('now','localtime'),?,?,?,?) ON CONFLICT(company_id,day) DO UPDATE SET total=excluded.total",[1,2,2,0,0],'run').text,/ON CONFLICT\(company_id,day\)/);
});
