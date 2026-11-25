import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/app.js';
import {buildConfig} from '../server/config.js';
import {compareVersions} from '../server/routes/system.js';
const password='clave-de-prueba-123';
const current='a'.repeat(40), latest='b'.repeat(40);
const history=[{deploy:{id:'dep-live',status:'live',commit:{id:current,message:'Actual'},createdAt:'2026-11-25T00:00:00Z'}},{deploy:{id:'dep-old',status:'deactivated',commit:{id:'c'.repeat(40),message:'Anterior'}}}];
async function fixture(fn,{configured=true,githubError=false,renderError=false,postError=false}={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stagehub-system-'));let app;const cookies={},calls=[];let list=structuredClone(history);
  const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
  const mock=async(url,opts)=>{
    calls.push({url,opts});
    if(url.startsWith('https://api.github.com/')){
      assert.equal(opts.headers.Authorization,'Bearer fake-github-key');
      if(githubError)return response({message:'fake-github-key'},404);
      if(url.endsWith('/commits/main'))return response({sha:latest});
      if(url.endsWith('/contents/package.json?ref='+latest))return response({encoding:'base64',content:Buffer.from('{"version":"0.5.1"}').toString('base64')});
    }
    if(url.startsWith('https://api.render.com/v1/services/srv-test/')){
      assert.equal(opts.headers.Authorization,'Bearer fake-render-key');
      if(renderError)return response({secret:'fake-render-key'},403);
      if(opts.method==='GET')return response(list);
      if(postError)return response({secret:'fake-render-key'},409);
      return response({id:'dep-new',status:'queued',secret:'fake-render-key'},201);
    }
    throw new Error('Unexpected mock request');
  };
  try{
    app=await createApp(buildConfig({databaseUrl:'',dataDir:dir,port:0,mailKey:'',mailFrom:'',renderKey:configured?'fake-render-key':'',renderServiceId:configured?'srv-test':'',githubToken:'fake-github-key',githubRepo:'orbitalld/StageHub',githubBranch:'main',gitCommit:current,systemFetch:mock}));
    await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
    const call=async(who,method,url,body,csrf=true)=>{const r=await fetch(base+url,{method,headers:{...(csrf?{'X-Requested-With':'stagehub'}:{}),'Content-Type':'application/json',...(cookies[who]?{Cookie:cookies[who]}:{})},body:body===undefined?undefined:JSON.stringify(body)});const sc=r.headers.get('set-cookie');if(sc)cookies[who]=sc.split(';')[0];return {status:r.status,json:await r.json()};};
    const m=await call('master','POST','/api/auth/setup',{username:'admin',full_name:'Master',password});assert.equal(m.status,201);
    const email='member@example.com';assert.equal((await call('anon','POST','/api/auth/register',{email,full_name:'Member',password})).status,201);
    const u=(await call('master','GET','/api/users')).json.find(x=>x.email===email);
    assert.equal((await call('master','PUT',`/api/users/${u.id}`,{role:'admin',approval_status:'approved',active:true,confirm_manual_email:true})).status,200);
    assert.equal((await call('member','POST','/api/auth/login',{username:email,password})).status,200);
    assert.equal((await call('member','POST','/api/companies',{name:'Mi empresa'})).status,201);
    await fn(call,app,calls,()=>{list=[{deploy:{id:'dep-running',status:'build_in_progress'}},...history];});
  }finally{if(app)await app.close();fs.rmSync(dir,{recursive:true,force:true});}
}
test('versiones numéricas, no comparación lexicográfica',()=>{assert.equal(compareVersions('0.4.10','0.4.8'),1);assert.equal(compareVersions('1.0.0','0.99.99'),1);assert.equal(compareVersions('0.4.8','0.4.8'),0);assert.equal(compareVersions('0.4.7','0.4.8'),-1);assert.equal(compareVersions('invalid','0.4.8'),null);});
test('versiones reales desde package.json remoto, caché y acceso exclusivo al panel Master',()=>fixture(async(call,app,calls)=>{
  assert.equal((await call('anon','GET','/api/system/version')).status,401);
  const v=await call('member','GET','/api/system/version');assert.equal(v.status,200);assert.equal(v.json.installed,'0.5.0');assert.equal(v.json.latest,'0.5.1');assert.equal(v.json.update_available,true);assert.equal(v.json.latest_commit,undefined);
  assert.equal((await call('member','GET','/api/system/status')).status,403);
  for(const mode of ['latest','clear_cache','rollback'])assert.equal((await call('member','POST','/api/system/deploy',{mode,confirm:true})).status,403);
  assert.equal(calls.length,2);
  const s=await call('master','GET','/api/system/status');assert.equal(s.status,200);assert.equal(s.json.version.commit_changed,true);assert.equal(s.json.live.id,'dep-live');assert.equal(s.json.deploys.length,2);assert.doesNotMatch(JSON.stringify(s.json),/fake-.*-key/);
  assert.equal((await call('master','POST','/api/system/deploy',{mode:'latest',confirm:true},false)).status,403);
  assert.equal((await call('master','POST','/api/system/deploy',{mode:'latest'})).status,422);
}));
for(const mode of ['latest','clear_cache','rollback'])test(`Render: ${mode}, auditoría y bloqueo de duplicados`,()=>fixture(async(call,app,calls)=>{
  if(mode==='rollback')assert.equal((await call('master','POST','/api/system/deploy',{mode,confirm:true,deploy_id:'dep-live'})).status,422);
  const body={mode,confirm:true,deploy_id:'dep-old'};
  const r=await call('master','POST','/api/system/deploy',body);assert.equal(r.status,202);assert.equal(r.json.accepted,true);assert.doesNotMatch(JSON.stringify(r.json),/fake-render-key/);
  const sent=calls.filter(x=>x.opts.method==='POST');assert.equal(sent.length,1);
  assert.deepEqual(JSON.parse(sent[0].opts.body),mode==='rollback'?{deployId:'dep-old'}:{clearCache:mode==='clear_cache'?'clear':'do_not_clear'});
  assert.ok(sent[0].url.endsWith(mode==='rollback'?'/rollback':'/deploys'));
  assert.equal((await call('master','POST','/api/system/deploy',body)).status,409);
  const s=await call('master','GET','/api/system/status');assert.equal(s.json.activity.length,2);assert.equal(s.json.activity[0].username,'admin');assert.equal(s.json.activity[1].action,'solicitar');
}));
test('despliegue en curso bloquea nuevas solicitudes',()=>fixture(async(call,app,calls,setBusy)=>{setBusy();const s=await call('master','GET','/api/system/status');assert.equal(s.json.busy,true);assert.equal((await call('master','POST','/api/system/deploy',{mode:'latest',confirm:true})).status,409);assert.equal(calls.filter(x=>x.opts.method==='POST').length,0);}));
test('servicios no configurados o GitHub inaccesible no impiden usar la app',()=>fixture(async(call)=>{const s=await call('master','GET','/api/system/status');assert.equal(s.status,200);assert.equal(s.json.version.latest,null);assert.equal(s.json.version.update_available,null);assert.equal(s.json.render_configured,false);assert.ok(s.json.render_error);assert.doesNotMatch(JSON.stringify(s.json),/fake-github-key/);assert.equal((await call('master','POST','/api/system/deploy',{mode:'latest',confirm:true})).status,503);assert.equal((await call('member','GET','/api/companies')).status,200);},{configured:false,githubError:true}));
test('errores de Render no filtran secretos ni se anuncian como despliegue realizado',()=>fixture(async(call)=>{const r=await call('master','POST','/api/system/deploy',{mode:'latest',confirm:true});assert.equal(r.status,502);assert.doesNotMatch(JSON.stringify(r.json),/fake-render-key/);const s=await call('master','GET','/api/system/status');assert.equal(s.json.activity[0].action,'no_confirmado');assert.equal((await call('master','POST','/api/system/deploy',{mode:'latest',confirm:true})).status,409);},{postError:true}));
