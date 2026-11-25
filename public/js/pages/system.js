import { get, post } from '../api.js?v=0.5.5';
import {appendSafe, replaceSafe,  h, clear, badge, confirmDialog, toast } from '../ui.js?v=0.5.5';
import { state } from '../state.js?v=0.5.5';

const short=sha=>sha?sha.slice(0,8):'No disponible';
const date=v=>{if(!v)return '—';const d=new Date(v.includes('T')?v:v.replace(' ','T')+'Z');return Number.isNaN(d.valueOf())?'—':d.toLocaleString('es-CL');};
const labels={live:'En línea',deactivated:'Anterior',created:'Creado',queued:'En cola',build_in_progress:'Compilando',pre_deploy_in_progress:'Preparando',update_in_progress:'Desplegando',build_failed:'Error de compilación',update_failed:'Error de despliegue',pre_deploy_failed:'Error de preparación',canceled:'Cancelado',cancelled:'Cancelado'};
const statusBadge=d=>badge(labels[d.status]||d.status||'Estado desconocido',d.status==='live'?'ok':d.status?.includes('failed')?'bad':d.status==='deactivated'?'':'warn');
import {versionLabel} from '../version-indicator.js?v=0.5.5';
export default async function systemPage(root){
  if(state.user?.role!=='master')throw new Error('Solo el Master global puede administrar el sistema.');
  let busy=false;
  const heading=h('div',{class:'stack'},h('h1',{},'Administración del sistema'),h('p',{class:'muted'},'Versiones, despliegues y recuperación del servidor de producción.'));
  const refresh=h('button',{class:'btn',onclick:()=>load(true)},'Actualizar estado');
  const body=h('div',{class:'stack'});
  appendSafe(root,heading,h('div',{class:'row wrap'},refresh),body);
  async function load(force=false){
    if(busy)return;busy=true;refresh.disabled=true;
    try{const data=await get('/api/system/status'+(force?'?refresh=1':''));render(data);}
    catch(e){replaceSafe(body,h('div',{class:'error-box'},e.message));}
    finally{busy=false;refresh.disabled=false;}
  }
  async function run(mode,id){
    if(busy)return;
    const rollback=mode==='rollback';
    if(!await confirmDialog({title:rollback?'Recuperar despliegue anterior':'Desplegar StageHub',message:rollback?'Se recuperará un despliegue anterior de Render. No se restaura la base de datos. Puede recuperar variables anteriores y dejar este panel inaccesible. Los autodespliegues no se desactivan automáticamente. Confirma que tienes respaldo y que el esquema de datos es compatible.':'Se iniciará un despliegue del último commit de la rama conectada en Render. El servicio podría reiniciarse y las personas conectadas podrían perder temporalmente el acceso.',confirmText:rollback?'Confirmar rollback':'Desplegar',danger:rollback}))return;
    if(busy)return;busy=true;refresh.disabled=true;
    for(const btn of body.querySelectorAll('button'))btn.disabled=true;
    try{await post('/api/system/deploy',{mode,deploy_id:id,confirm:true});toast('Render aceptó la solicitud. Comprueba el estado; todavía no ha terminado.');}
    catch(e){toast(e.message,'error');}
    finally{busy=false;refresh.disabled=false;await load();}
  }
  function render(d){
    const v=d.version,blocked=!!d.render_error||d.busy;
    replaceSafe(body,h('section',{class:'card stack'},h('h2',{},'Versión y repositorio'),
      h('div',{class:'system-grid'},h('div',{},h('span',{class:'muted small'},'Versión instalada'),h('h2',{},`v${v.installed}`),h('p',{class:'muted small'},`Commit: ${short(v.installed_commit)}`)),h('div',{},h('span',{class:'muted small'},'Versión en GitHub'),h('h2',{},v.latest?`v${v.latest}`:'No disponible'),h('p',{class:'muted small'},`Commit: ${short(v.latest_commit)}`))),
      badge(versionLabel(v),v.update_available?'warn':v.error?'bad':'ok'),v.commit_changed?h('p',{class:'muted'},'El commit en GitHub es distinto del instalado, incluso si el número de versión coincide.'):null,
      h('p',{class:'muted small'},`${d.repository} · ${d.branch} · Verificado: ${date(v.checked_at)}`),v.error?h('p',{class:'error-box'},v.error):null),
      h('section',{class:'card stack'},h('h2',{},'Servidor Render'),d.render_error?h('div',{class:'error-box'},d.render_error):h('div',{class:'row wrap'},d.live?statusBadge(d.live):badge('Sin despliegue en línea confirmado','warn'),d.busy?badge('Despliegue en curso','warn'):null),
        h('div',{class:'row wrap'},h('button',{class:'btn primary',disabled:blocked,onclick:()=>run('latest')},'Desplegar último commit'),h('button',{class:'btn',disabled:blocked,onclick:()=>run('clear_cache')},'Limpiar caché y desplegar')),
        h('p',{class:'muted small'},'No se realizan despliegues automáticamente desde StageHub. Actualiza el estado para comprobar el resultado.')),
      h('section',{class:'card stack'},h('h2',{},'Historial de despliegues'),h('p',{class:'muted small'},'Últimos 20 despliegues. Render determina si conserva el artefacto para rollback. No recupera datos de Supabase.'),
        d.deploys.length?d.deploys.map(x=>h('div',{class:'system-history'},h('div',{class:'row wrap'},statusBadge(x),h('span',{class:'muted small'},date(x.created_at))),h('div',{},x.message||'Sin mensaje'),h('div',{class:'muted small'},`${x.id} · ${short(x.commit)} · ${x.trigger||'Origen desconocido'}`),x.status==='deactivated'?h('button',{class:'btn danger',disabled:blocked,onclick:()=>run('rollback',x.id)},'Rollback a este despliegue'):null)):h('p',{class:'muted'},'Sin historial disponible.')),
      h('section',{class:'card stack'},h('h2',{},'Auditoría de StageHub'),h('p',{class:'muted small'},'Solicitudes iniciadas desde esta aplicación. No identifica actores de despliegues hechos fuera de StageHub.'),d.activity.length?d.activity.map(a=>h('div',{class:'system-history'},h('div',{},a.summary),h('div',{class:'muted small'},`${a.username||'Usuario eliminado'} · ${date(a.ts)} · ${a.action}`))):h('p',{class:'muted'},'Aún no hay solicitudes registradas.')));
  }
  await load();
  const timer=setInterval(()=>{if(!root.isConnected){clearInterval(timer);return;}if(document.visibilityState==='visible')load();},30000);
}
