import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { buildConfig } from '../server/config.js';
import { openDb,migrate } from '../server/db.js';
import { effectiveRole } from '../server/permissions.js';

const password='clave-de-prueba-123';
async function withApp(fn,options={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stagehub-roles-'));const cookies={};let app;
  try{
    app=await createApp(buildConfig({databaseUrl:'',dataDir:dir,port:0,mailKey:'',mailFrom:'',...options}));
    await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
    const request=async(who,method,url,body,company=1)=>{
      const r=await fetch(base+url,{method,headers:{'X-Requested-With':'stagehub','Content-Type':'application/json','X-StageHub-Company':String(company),...(cookies[who]?{Cookie:cookies[who]}:{})},body:body===undefined?undefined:JSON.stringify(body)});
      const sc=r.headers.get('set-cookie');if(sc)cookies[who]=sc.split(';')[0];
      return {status:r.status,json:r.status===204?null:await r.json()};
    };
    const master=await request('master','POST','/api/auth/setup',{username:'admin',full_name:'Master inicial',password});assert.equal(master.status,201);assert.equal(master.json.user.role,'master');
    await fn(request,app,master.json.user.id);
  }finally{if(app)await app.close();fs.rmSync(dir,{recursive:true,force:true});}
}
test('registro, aprobación, permisos reales por rol, empresas visibles y revocación de sesiones',async()=>withApp(async(call,app,masterId)=>{
  const email='persona@example.com';
  assert.equal((await call('anon','POST','/api/auth/register',{email:'no-es-correo',full_name:'Persona',password})).status,422);
  const reg=await call('anon','POST','/api/auth/register',{email:'Persona@Example.COM',full_name:'Persona',password,role:'master',active:true});assert.equal(reg.status,201);
  assert.equal((await call('anon','POST','/api/auth/register',{email,full_name:'Otra',password})).status,409);
  assert.equal((await call('reader','POST','/api/auth/login',{username:email,password})).status,403);
  assert.equal((await call('reader','GET','/api/companies')).status,401);
  const users=(await call('master','GET','/api/users')).json;const u=users.find(u=>u.email===email);assert.equal(u.role,'user');assert.equal(u.approval_status,'pending');assert.equal(u.active,false);assert.ok(!('password_hash' in u));assert.ok(!('verification_hash' in u));
  const approval={role:'user',approval_status:'approved',active:true};
  assert.equal((await call('master','PUT',`/api/users/${u.id}`,approval)).status,422);
  assert.equal((await call('master','PUT',`/api/users/${u.id}`,{...approval,confirm_manual_email:true})).status,200);
  assert.equal((await call('master','PUT',`/api/users/${masterId}`,{...approval,role:'user'})).status,409);
  const co=await call('master','POST','/api/companies',{name:'Otra empresa'});assert.equal(co.status,201);
  const login=await call('reader','POST','/api/auth/login',{username:'PERSONA@example.com',password});assert.equal(login.status,200);assert.equal(login.json.user.role,'user');
  assert.equal((await call('reader','GET','/api/companies')).json.length,2);
  assert.equal((await call('reader','GET','/api/items',undefined,co.json.id)).status,200);
  for(const [method,url,body] of [['POST','/api/items',{}],['POST','/api/companies',{name:'No'}],['GET','/api/users'],['PUT',`/api/users/${u.id}`,{...approval,role:'master'}]])assert.equal((await call('reader',method,url,body)).status,403);
  assert.equal((await call('master','PUT',`/api/users/${u.id}`,{...approval,role:'admin'})).status,200);
  assert.equal((await call('reader','GET','/api/items')).status,401);
  assert.equal((await call('reader','POST','/api/auth/login',{username:email,password})).json.user.role,'admin');
  const cat=(await call('reader','GET','/api/categories')).json[0];
  assert.equal((await call('reader','POST','/api/items',{name:'Equipo de prueba',category_id:cat.id,tracking_mode:'cantidad',qty_total:2},co.json.id)).status,201);
  assert.equal((await call('reader','POST','/api/companies',{name:'No'})).status,403);
  assert.equal((await call('reader','GET','/api/users')).status,403);
  assert.equal((await call('master','PUT',`/api/users/${u.id}`,{...approval,role:'admin',active:false})).status,200);
  assert.equal((await call('reader','GET','/api/items')).status,401);
  assert.equal((await call('reader','POST','/api/auth/login',{username:email,password})).status,403);
}));

test('verificación de correo con proveedor HTTP simulado, código de un solo uso y aprobación obligatoria',async()=>{
  const original=globalThis.fetch;let code;
  globalThis.fetch=async (url,opts)=>{
    if(url==='https://api.resend.com/emails'){const body=JSON.parse(opts.body);assert.equal(body.to[0],'correo@example.com');code=body.text.split('\n\n')[1];return new Response('{}',{status:200});}
    return original(url,opts);
  };
  try{await withApp(async(call)=>{
    const email='correo@example.com';assert.equal((await call('anon','POST','/api/auth/register',{email,full_name:'Persona',password})).json.verification_required,true);assert.ok(code);
    let u=(await call('master','GET','/api/users')).json.find(u=>u.email===email);assert.equal(u.email_verified,false);
    const approval={role:'user',approval_status:'approved',active:true,confirm_manual_email:true};
    assert.equal((await call('master','PUT',`/api/users/${u.id}`,approval)).status,409);
    assert.equal((await call('anon','POST','/api/auth/verify-email',{email,code:'incorrecto'})).status,422);
    assert.equal((await call('anon','POST','/api/auth/verify-email',{email,code})).status,200);
    assert.equal((await call('anon','POST','/api/auth/verify-email',{email,code})).status,422);
    assert.equal((await call('anon','POST','/api/auth/login',{username:email,password})).status,403);
    assert.equal((await call('master','PUT',`/api/users/${u.id}`,approval)).json.email_verified,true);
    assert.equal((await call('anon','POST','/api/auth/login',{username:email,password})).status,200);
  },{mailKey:'mock',mailFrom:'StageHub <test@example.com>'});}finally{globalThis.fetch=original;}
});

test('migración v0.3 conserva usuarios, hashes, sesiones y asigna tres roles',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stagehub-migration-users-'));const cfg=buildConfig({dataDir:dir,databaseUrl:''});const old=path.join(dir,'old');fs.mkdirSync(old);
  const db=openDb(cfg.dbFile);
  try{
    for(const f of fs.readdirSync(cfg.migrationsDir).filter(f=>!f.startsWith('004')&&!f.startsWith('005')))fs.copyFileSync(path.join(cfg.migrationsDir,f),path.join(old,f));
    migrate(db,old);
    for(const role of ['admin','bodega','supervisor','tecnico','consulta'])db.prepare('INSERT INTO users(username,full_name,password_hash,role) VALUES (?,?,?,?)').run(role,role,'hash-historico',role);
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').run('sesion',1,'2099-01-01 00:00:00');
    assert.deepEqual(migrate(db,cfg.migrationsDir),['004_usuarios.sql','005_company_logos.sql']);
    const rows=db.prepare('SELECT * FROM users ORDER BY id').all();assert.deepEqual(rows.map(effectiveRole),['master','admin','user','user','user']);assert.ok(rows.every(u=>u.password_hash==='hash-historico'&&u.active===1&&u.approval_status==='approved'));assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,1);assert.deepEqual(migrate(db,cfg.migrationsDir),[]);
  }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('Master edita nombres, revoca sesiones y elimina cuentas sin perder equipos ni auditoría',async()=>withApp(async(call,app,masterId)=>{
  const email='eliminar@example.com';
  const approval={role:'admin',approval_status:'approved',active:true,confirm_manual_email:true};
  assert.equal((await call('anon','POST','/api/auth/register',{email,full_name:'Nombre anterior',password})).status,201);
  const u=(await call('master','GET','/api/users')).json.find(u=>u.email===email);
  const update=await call('master','PUT',`/api/users/${u.id}`,{...approval,full_name:'Nombre nuevo'});
  assert.equal(update.status,200);assert.equal(update.json.full_name,'Nombre nuevo');
  assert.equal((await call('master','DELETE',`/api/users/${masterId}`)).status,409);
  assert.equal((await call('master','POST',`/api/users/${masterId}/revoke-sessions`)).status,409);
  for(const who of ['admin1','admin2'])assert.equal((await call(who,'POST','/api/auth/login',{username:email,password})).status,200);
  const cat=(await call('admin1','GET','/api/categories')).json[0];
  const item=await call('admin1','POST','/api/items',{name:'Equipo conservado',category_id:cat.id,tracking_mode:'cantidad',qty_total:2});assert.equal(item.status,201);
  assert.equal((await call('admin1','DELETE',`/api/users/${masterId}`)).status,403);
  assert.equal((await call('admin1','POST',`/api/users/${u.id}/revoke-sessions`)).status,403);
  assert.equal((await call('anon','DELETE',`/api/users/${u.id}`)).status,401);
  assert.equal((await call('master','POST',`/api/users/${u.id}/revoke-sessions`)).json.revoked,2);
  for(const who of ['admin1','admin2'])assert.equal((await call(who,'GET','/api/items')).status,401);
  assert.equal((await call('admin1','POST','/api/auth/login',{username:email,password})).status,200);
  assert.equal((await call('master','DELETE',`/api/users/${u.id}`)).status,204);
  assert.equal((await call('master','DELETE',`/api/users/${u.id}`)).status,404);
  assert.equal((await call('admin1','GET','/api/items')).status,401);
  assert.equal((await call('admin1','POST','/api/auth/login',{username:email,password})).status,401);
  assert.equal((await call('master','GET',`/api/items/${item.json.id}`)).status,200);
  assert.equal(app.db.prepare('SELECT created_by FROM items WHERE id=?').get(item.json.id).created_by,null);
  assert.ok(app.db.prepare("SELECT * FROM audit_log WHERE entity='user' AND entity_id=? AND action='eliminar'").get(u.id));
  assert.ok(app.db.prepare("SELECT * FROM audit_log WHERE entity='item' AND entity_id=?").get(item.json.id));
  assert.equal((await call('master','GET','/api/users')).json.some(x=>x.id===u.id),false);
  assert.equal((await call('anon','POST','/api/auth/register',{email,full_name:'Nueva solicitud',password})).status,201);
  const next=(await call('master','GET','/api/users')).json.find(x=>x.email===email);assert.notEqual(next.id,u.id);assert.equal(next.approval_status,'pending');
}));

test('Master elimina solicitudes pendientes; Usuario no puede gestionar cuentas y otro Master no puede eliminarse a sí mismo',async()=>withApp(async(call,app,masterId)=>{
  for(const [email,full_name] of [['lector@example.com','Lector'],['pendiente@example.com','Pendiente'],['master2@example.com','Segundo Master']])assert.equal((await call('anon','POST','/api/auth/register',{email,full_name,password})).status,201);
  const rows=(await call('master','GET','/api/users')).json;
  const reader=rows.find(x=>x.email==='lector@example.com'),pending=rows.find(x=>x.email==='pendiente@example.com'),other=rows.find(x=>x.email==='master2@example.com');
  const approve={approval_status:'approved',active:true,confirm_manual_email:true};
  assert.equal((await call('master','PUT',`/api/users/${reader.id}`,{...approve,role:'user'})).status,200);
  assert.equal((await call('reader','POST','/api/auth/login',{username:reader.email,password})).status,200);
  assert.equal((await call('reader','DELETE',`/api/users/${pending.id}`)).status,403);
  assert.equal((await call('reader','POST',`/api/users/${pending.id}/revoke-sessions`)).status,403);
  assert.equal((await call('master','DELETE',`/api/users/${pending.id}`)).status,204);
  assert.equal((await call('master','PUT',`/api/users/${other.id}`,{...approve,role:'master'})).status,200);
  assert.equal((await call('other','POST','/api/auth/login',{username:other.email,password})).status,200);
  assert.equal((await call('other','DELETE',`/api/users/${other.id}`)).status,409);
  assert.equal((await call('master','DELETE',`/api/users/${other.id}`)).status,204);
  assert.equal((await call('other','GET','/api/users')).status,401);
  assert.equal((await call('master','DELETE',`/api/users/${masterId}`)).status,409);
}));
