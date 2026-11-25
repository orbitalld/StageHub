import { get, put, post, del } from '../api.js?v=0.5.0';
import { roleSelect, roles } from './members.js?v=0.5.0';
import { can, state } from '../state.js?v=0.5.0';
import { h, clear, badge, field, guarded, fmtDateTime, confirmDialog, modal } from '../ui.js?v=0.5.0';

const labels={user:'Usuario · Permisos por empresa',admin:'Administrador · Histórico (permisos por empresa)' ,master:'Master · Acceso completo'};
export default async function usersPage(el){
  if(!can('users:write'))throw new Error('Solo el Master puede gestionar usuarios');
  let users=await get('/api/users');
  const search=h('input',{type:'search',placeholder:'Buscar por nombre o correo','aria-label':'Buscar usuarios',oninput:()=>draw()});
  const filter=h('select',{'aria-label':'Filtrar usuarios',onchange:()=>draw()},h('option',{value:'all'},'Todas las cuentas'),h('option',{value:'pending'},'Pendientes'),h('option',{value:'approved'},'Aprobadas'),h('option',{value:'rejected'},'Rechazadas'),h('option',{value:'active'},'Con acceso'),h('option',{value:'disabled'},'Desactivadas'));
  const counts=h('div',{class:'grid cols-2'});
  const list=h('div',{class:'grid cols-2'});
  const notice=h('p',{class:'muted small',role:'status','aria-live':'polite'});
  el.append(h('div',{class:'page-head'},h('div',{},h('h1',{},'Administración de usuarios'),h('p',{class:'muted'},'Gestiona las solicitudes, el acceso y los tres roles de StageHub.'))),counts,h('div',{class:'card stack',style:{margin:'14px 0'}},search,filter),notice,list);
  function draw(){
    clear(counts).append(h('div',{class:'kpi'},h('div',{class:'label'},'Usuarios registrados'),h('div',{class:'value'},users.length)),h('div',{class:'kpi'},h('div',{class:'label'},'Solicitudes pendientes'),h('div',{class:'value'},users.filter(u=>u.approval_status==='pending').length)));
    const q=search.value.toLowerCase().trim();
    const rows=users.filter(u=>(filter.value==='all'||u.approval_status===filter.value||(filter.value==='active'&&u.active)||(filter.value==='disabled'&&u.approval_status==='approved'&&!u.active))&&`${u.full_name} ${u.email||''} ${u.username}`.toLowerCase().includes(q));
    clear(list).append(...(rows.length?rows.map(card):[h('p',{class:'muted'},'No hay cuentas que coincidan.') ]));
  }
  function card(u){
    const own=u.id===state.user.id;
    const name=h('input',{type:'text',value:u.full_name,maxlength:100,disabled:own,'aria-label':'Nombre completo'});
    const role=h('select',{value:u.role,disabled:own},Object.entries(labels).map(([value,label])=>h('option',{value},label)));
    const status=h('select',{value:u.approval_status,disabled:own},[['pending','Pendiente'],['approved','Aprobada'],['rejected','Rechazada']].map(([value,label])=>h('option',{value},label)));
    const active=h('input',{type:'checkbox',checked:u.active||u.approval_status==='pending',disabled:own});
    const manual=h('input',{type:'checkbox'});
    const err=h('div',{class:'error-box',hidden:true});
    const btn=h('button',{class:'btn primary',disabled:own,onclick:()=>guarded(btn,err,async()=>{
      if(role.value==='master'&&u.role!=='master'&&!window.confirm('¿Conceder acceso completo a este usuario?'))return;
      const updated=await put(`/api/users/${u.id}`,{full_name:name.value,role:role.value,approval_status:status.value,active:active.checked,confirm_manual_email:manual.checked});
      users=users.map(x=>x.id===updated.id?updated:x);notice.textContent=`Cambios guardados: ${updated.full_name}`;draw();
    })},'Guardar permisos');
    const revoke=h('button',{class:'btn',disabled:own,onclick:()=>guarded(revoke,err,async()=>{
      if(!await confirmDialog({title:'Cerrar sesiones',message:`¿Cerrar todas las sesiones de ${u.full_name}? Podrá iniciar sesión nuevamente si tiene acceso.`,confirmText:'Cerrar sesiones'}))return;
      const result=await post(`/api/users/${u.id}/revoke-sessions`);notice.textContent=`Sesiones cerradas de ${u.full_name}: ${result.revoked}`;
    })},'Cerrar todas las sesiones');
    const remove=h('button',{class:'btn danger',disabled:own,onclick:()=>guarded(remove,err,async()=>{
      if(!await confirmDialog({title:'Eliminar usuario definitivamente',message:`¿Eliminar la cuenta de ${u.full_name}? Se perderán sus credenciales y sesiones. Los equipos y el historial se conservarán. Esta acción no se puede deshacer.`,confirmText:'Eliminar usuario',danger:true}))return;
      await del(`/api/users/${u.id}`);users=users.filter(x=>x.id!==u.id);notice.textContent=`Usuario eliminado: ${u.full_name}`;draw();
    })},'Eliminar usuario');
    return h('section',{class:'card stack user-card'},h('div',{class:'row wrap'},h('h2',{style:{margin:0,overflowWrap:'anywhere'}},u.full_name),own?badge('Tu cuenta','ok'):null,badge(u.approval_status==='pending'?'Pendiente':u.active?'Activa':'Sin acceso',u.approval_status==='pending'?'warn':u.active?'ok':'bad')),
      h('div',{class:'muted small',style:{overflowWrap:'anywhere'}},u.email||`Usuario: ${u.username}`),u.email?h('div',{class:'small'},u.email_verified?'Correo confirmado':u.verification_required?'Correo sin verificar · código obligatorio':'Correo sin verificar automáticamente'):null,
      h('div',{class:'muted small'},`Último acceso: ${fmtDateTime(u.last_login_at)}`),err,field('Nombre completo',name),field('Rol',role),field('Estado de solicitud',status),h('label',{class:'row'},active,' Permitir acceso cuando esté aprobada'),
      !own&&u.email&&!u.email_verified&&!u.verification_required&&u.approval_status!=='approved'?h('label',{class:'row'},manual,' Confirmo que comprobé manualmente el correo de esta persona'):null,
      own?h('p',{class:'muted small'},'Tu cuenta está protegida contra cambios de permisos, cierre forzado de sesiones y eliminación.'):h('div',{class:'row wrap user-actions'},btn,h('button',{class:'btn',disabled:!u.active||u.approval_status!=='approved',onclick:()=>assign(u).catch(e=>{err.hidden=false;err.textContent=e.message;})},'Asignar empresas'),revoke,remove));
  }
  async function assign(u){
    const memberships=await get(`/api/users/${u.id}/companies`), companies=await get('/api/companies');
    const body=h('div',{class:'stack'},h('p',{class:'muted'},'Asigna una o varias empresas. Cada cambio se guarda individualmente.'));
    for(const co of companies){const previous=memberships.find(m=>m.company_id===co.id);const select=h('select',{},h('option',{value:''},'Sin acceso'),...Object.entries(roles).filter(([r])=>r!=='master').map(([value,label])=>h('option',{value},label)));select.value=previous?.member_role||'';const err=h('div',{class:'error-box',hidden:true});let current=select.value;const save=h('button',{class:'btn primary',onclick:()=>guarded(save,err,async()=>{if(select.value===current)return;if(select.value)await put(`/api/companies/${co.id}/members/${u.id}`,{role:select.value});else if(current)await del(`/api/companies/${co.id}/members/${u.id}`);current=select.value;notice.textContent=`Acceso actualizado: ${u.full_name} · ${co.name}`;save.textContent='Guardado';})},'Guardar');select.addEventListener('change',()=>save.textContent='Guardar');body.append(h('section',{class:'card stack'},h('strong',{},co.name),select,err,save));}
    const m=modal({title:`Empresas de ${u.full_name}`,body,footer:[h('button',{class:'btn',onclick:()=>m.close()},'Cerrar')]});
  }
  draw();
}
