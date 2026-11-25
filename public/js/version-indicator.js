import {get} from './api.js?v=0.5.5';
import {h,replaceSafe,appendSafe} from './ui.js?v=0.5.5';
import {state} from './state.js?v=0.5.5';
// Compartir la consulta entre encabezado móvil y menú lateral sin almacenar datos privados de sesión.
let pending=null;
function readVersion(){if(!pending)pending=get('/api/system/version').finally(()=>{pending=null;});return pending;}
export function versionLabel(v){
  if(v.update_available&&v.latest)return `Nueva versión: v${v.latest}`;
  if(v.unavailable||v.error)return 'No se pudo comprobar GitHub';
  if(v.latest&&v.installed===v.latest)return `Última versión: v${v.latest}`;
  return v.latest?`GitHub: v${v.latest}`:'Versión remota no disponible';
}
export function versionIndicator(){
  const node=h('div',{class:'version-indicator',role:'status'},h('span',{class:'muted small'},'StageHub v0.5.5'));
  const update=()=>readVersion().then(v=>{if(!node.isConnected)return;replaceSafe(node,h('span',{class:'small'},`StageHub v${v.installed}`),h('span',{class:`small ${v.update_available?'version-new':'muted'}`},versionLabel(v)));if(state.user?.role==='master')appendSafe(node,h('a',{href:'#/system',class:'small'},'Administrar actualizaciones'));}).catch(()=>{});
  update();
  const timer=setInterval(()=>{if(!node.isConnected){clearInterval(timer);return;}if(document.visibilityState==='visible')update();},300000);
  return node;
}
