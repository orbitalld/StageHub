import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from '../http.js';
import { audit } from '../audit.js';
import { effectiveRole } from '../permissions.js';

// Solo versiones estables numéricas. Nunca ejecutar código procedente de GitHub.
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SHA = /^[a-f0-9]{40}$/i;
const DEPLOY = /^dep-[a-zA-Z0-9-]{1,100}$/;
const terminal = new Set(['live','deactivated','build_failed','update_failed','pre_deploy_failed','canceled','cancelled','failed']);
export function compareVersions(a,b) {
  if(!VERSION.test(a)||!VERSION.test(b))return null;
  const x=a.split('.').map(BigInt),y=b.split('.').map(BigInt);
  for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;
  return 0;
}
const str=(v,n=160)=>typeof v==='string'?v.slice(0,n):null;
function deployView(d){
  if(!d||!DEPLOY.test(d.id||''))return null;
  return {id:d.id,status:str(d.status,60)||'unknown',commit:SHA.test(d.commit?.id||'')?d.commit.id:null,
    message:str(d.commit?.message,250),created_at:str(d.createdAt,40),finished_at:str(d.finishedAt,40),trigger:str(d.trigger,40)};
}
export function registerSystemRoutes(router,{db,cfg}){
  const installed=JSON.parse(fs.readFileSync(path.join(cfg.root,'package.json'),'utf8')).version;
  const repo=cfg.githubRepo,branch=cfg.githubBranch;
  const renderReady=Boolean(cfg.renderKey && /^srv-[a-zA-Z0-9-]+$/.test(cfg.renderServiceId));
  const githubReady=/^[\w.-]+\/[\w.-]+$/.test(repo)&&!!branch;
  const gitBase=`https://api.github.com/repos/${repo}`;
  const renderBase=`https://api.render.com/v1/services/${encodeURIComponent(cfg.renderServiceId)}`;
  let cached=null,cachedAt=0;
  function master(c){if(effectiveRole(c.user)!=='master')throw new HttpError(403,'Solo el Master global puede administrar el sistema');}
  async function request(url,provider,{method='GET',body}={}){
    const key=provider==='GitHub'?cfg.githubToken:cfg.renderKey;
    const headers={Accept:'application/json',...(key?{Authorization:`Bearer ${key}`}:{})};
    if(provider==='GitHub'){headers.Accept='application/vnd.github+json';headers['X-GitHub-Api-Version']='2022-11-28';headers['User-Agent']='StageHub';}
    if(body!==undefined)headers['Content-Type']='application/json';
    let res;
    try{res=await cfg.systemFetch(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(6000)});}
    catch{throw new HttpError(502,`${provider}: conexión no disponible. Comprueba el estado antes de reintentar una operación.`);}
    if(!res.ok)throw new HttpError(502,`${provider}: HTTP ${res.status}. Revisa configuración, permisos y estado del servicio.`);
    try{return await res.json();}catch{throw new HttpError(502,`${provider}: respuesta no válida`);}
  }
  async function version(force=false){
    if(!force&&cached&&Date.now()-cachedAt<300000)return cached;
    // Límite de refresco manual incluso para el Master.
    if(cached&&Date.now()-cachedAt<15000)return cached;
    const v={installed,latest:null,installed_commit:SHA.test(cfg.gitCommit)?cfg.gitCommit:null,latest_commit:null,update_available:null,commit_changed:null,checked_at:new Date().toISOString(),error:null};
    try{
      if(!githubReady)throw new Error('Repositorio GitHub no configurado');
      const head=await request(`${gitBase}/commits/${encodeURIComponent(branch)}`,'GitHub');
      if(!SHA.test(head.sha||''))throw new Error('No se pudo identificar el commit de GitHub');
      v.latest_commit=head.sha;
      const pkg=await request(`${gitBase}/contents/package.json?ref=${head.sha}`,'GitHub');
      if(pkg.encoding!=='base64'||typeof pkg.content!=='string'||pkg.content.length>150000)throw new Error('package.json no válido');
      const remote=JSON.parse(Buffer.from(pkg.content,'base64').toString('utf8')).version;
      if(typeof remote!=='string'||!VERSION.test(remote))throw new Error('Versión de GitHub no válida');
      v.latest=remote;v.update_available=compareVersions(remote,installed)>0;
      v.commit_changed=v.installed_commit?head.sha!==v.installed_commit:null;
    }catch(e){v.error=e instanceof HttpError?e.message:'No se pudo comprobar la versión publicada en GitHub.';}
    cached=v;cachedAt=Date.now();return v;
  }
  async function deploys(){
    if(!renderReady)throw new HttpError(503,'Configura RENDER_API_KEY y RENDER_SERVICE_ID en Render.');
    const r=await request(`${renderBase}/deploys?limit=20`,'Render');
    if(!Array.isArray(r))throw new HttpError(502,'Render: historial no válido');
    return r.map(x=>deployView(x.deploy)).filter(Boolean);
  }
  async function activity(){return await db.prepare("SELECT ts, username, action, summary FROM audit_log WHERE entity='system_deploy' ORDER BY id DESC LIMIT 30").all();}
  router.add('GET','/api/system/version',{},async c=>{
    const v=await version(c.query.refresh==='1'&&effectiveRole(c.user)==='master');
    // Los usuarios normales ven solo el número de versión y si hay novedades.
    return {installed:v.installed,latest:v.latest,update_available:v.update_available,checked_at:v.checked_at,unavailable:!!v.error};
  });
  router.add('GET','/api/system/status',{},async c=>{
    master(c);const v=await version(c.query.refresh==='1');let list=[],renderError=null;
    try{list=await deploys();}catch(e){renderError=e.message;}
    return {version:v,repository:repo,branch,render_configured:renderReady,render_error:renderError,deploys:list,live:list.find(d=>d.status==='live')||null,busy:list.some(d=>!terminal.has(d.status)),activity:await activity()};
  });
  router.add('POST','/api/system/deploy',{},async c=>{
    master(c);
    if(c.body.confirm!==true||!['latest','clear_cache','rollback'].includes(c.body.mode))throw new HttpError(422,'Confirma la operación y selecciona un modo válido.');
    const mode=c.body.mode;
    // El ámbito de BD existente serializa solicitudes incluso entre instancias PostgreSQL.
    const last=await db.prepare("SELECT ts FROM audit_log WHERE entity='system_deploy' AND action='solicitar' ORDER BY id DESC LIMIT 1").get();
    if(last&&Date.now()-Date.parse(last.ts.replace(' ','T')+'Z')<60000)throw new HttpError(409,'Ya se solicitó un despliegue recientemente. Actualiza el estado antes de reintentar.');
    const list=await deploys();
    if(list.some(d=>!terminal.has(d.status)))throw new HttpError(409,'Hay un despliegue en curso. Espera a que termine.');
    let target=null;
    if(mode==='rollback'){
      if(typeof c.body.deploy_id!=='string'||!DEPLOY.test(c.body.deploy_id))throw new HttpError(422,'Despliegue no válido');
      target=list.find(d=>d.id===c.body.deploy_id&&d.status==='deactivated');
      if(!target)throw new HttpError(422,'Solo puedes recuperar un despliegue anterior exitoso del historial.');
    }
    const label=mode==='rollback'?`Rollback a ${target.id}`:mode==='clear_cache'?'Desplegar último commit limpiando caché':'Desplegar último commit';
    // Persistir el actor antes del efecto externo: el proceso puede reiniciarse inmediatamente.
    await audit(db,c.user,'solicitar','system_deploy',null,label);
    try{
      const result=await request(`${renderBase}/${mode==='rollback'?'rollback':'deploys'}`,'Render',{method:'POST',body:mode==='rollback'?{deployId:target.id}:{clearCache:mode==='clear_cache'?'clear':'do_not_clear'}});
      const d=deployView(result?.deploy||result);
      await audit(db,c.user,'aceptado','system_deploy',null,`${label}: solicitud aceptada por Render${d?' ('+d.id+')':''}`);
      c.status=202;return {accepted:true,deploy:d};
    }catch(e){await audit(db,c.user,'no_confirmado','system_deploy',null,`${label}: resultado no confirmado. Consultar Render.`);throw e;}
  });
}
