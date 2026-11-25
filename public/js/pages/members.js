import { get,post,put,del } from '../api.js?v=0.4.8';
import { state,can } from '../state.js?v=0.4.8';
import { h,field,guarded,toast,confirmDialog,clear } from '../ui.js?v=0.4.8';
export const roles={reader:'Solo lectura',inventory:'Gestión de inventario',members:'Gestión de usuarios (inventario solo lectura)',manager:'Inventario y usuarios',owner:'Propietario',master:'Master global'};
export const roleSelect=(value,options=['reader','inventory','members','manager'])=>h('select',{value},options.map(r=>h('option',{value:r},roles[r])));
export async function requestsPage(el){
 const rows=await get('/api/requests');el.append(h('h1',{},'Solicitudes'),h('p',{class:'muted'},'Invitaciones a empresas. Acepta únicamente las que reconozcas.'));
 if(!rows.length)el.append(h('p',{class:'muted'},'No tienes solicitudes pendientes.'));
 for(const r of rows){const err=h('div',{class:'error-box',hidden:true});const respond=decision=>async()=>{try{await post(`/api/requests/${r.id}/respond`,{decision});toast(decision==='accepted'?'Invitación aceptada':'Invitación rechazada');location.reload();}catch(e){err.hidden=false;err.textContent=e.message;}};el.append(h('section',{class:'card stack',style:{marginBottom:'12px'}},h('h2',{},r.company_name),h('p',{},`Invitación de ${r.sender_name} · ${roles[r.member_role]}`),err,h('div',{class:'row wrap'},h('button',{class:'btn primary',onclick:respond('accepted')},'Aceptar'),h('button',{class:'btn',onclick:respond('declined')},'Rechazar'))));}
}
export async function membersPage(el,[id]){
 const co=state.companies.find(c=>c.id===Number(id));if(!co)throw new Error('Empresa no disponible');
 const master=state.user.role==='master', actor=co.member_role;
 if(!master&&!['owner','members','manager'].includes(actor))throw new Error('No tienes permiso para gestionar miembros');
 const options=master||['owner','manager'].includes(actor)?['reader','inventory','members','manager']:['reader','members'];
 const members=await get(`/api/companies/${id}/members`), invitations=await get(`/api/companies/${id}/invitations`);
 const email=h('input',{type:'email',required:true,maxlength:254,placeholder:'correo@ejemplo.cl'}), role=roleSelect('reader',options), err=h('div',{class:'error-box',hidden:true});
 const send=h('button',{class:'btn primary',type:'submit'},'Enviar solicitud');
 el.append(h('a',{href:'#/companies',class:'btn ghost'},'Volver a empresas'),h('h1',{},`Miembros · ${co.name}`),h('section',{class:'card stack'},h('h2',{},'Invitar por correo'),h('p',{class:'muted'},'La persona debe tener una cuenta activa y aprobada. Recibirá una solicitud dentro de StageHub.'),h('form',{class:'stack',onsubmit:e=>{e.preventDefault();guarded(send,err,async()=>{await post(`/api/companies/${id}/invitations`,{email:email.value,role:role.value});toast('Solicitud enviada');location.reload();});}},err,field('Correo electrónico',email),field('Permiso',role),send)),h('h2',{},'Miembros actuales'));
 if(!members.length)el.append(h('p',{class:'muted'},'No hay miembros asignados. El Master conserva acceso.'));
 for(const m of members){const editable=m.id!==state.user.id&&(master||(actor==='owner'&&m.member_role!=='owner')||(['manager','members'].includes(actor)&&options.includes(m.member_role)));const select=roleSelect(m.member_role,master?[...options,'owner']:options), error=h('div',{class:'error-box',hidden:true});const save=h('button',{class:'btn primary',onclick:()=>guarded(save,error,async()=>{await put(`/api/companies/${id}/members/${m.id}`,{role:select.value});toast('Permiso actualizado');location.reload();})},'Guardar');const remove=h('button',{class:'btn danger',onclick:()=>guarded(remove,error,async()=>{if(!await confirmDialog({title:'Retirar acceso',message:`¿Quitar a ${m.full_name} de esta empresa?`,confirmText:'Retirar acceso',danger:true}))return;await del(`/api/companies/${id}/members/${m.id}`);location.reload();})},'Retirar acceso');el.append(h('section',{class:'card stack',style:{marginBottom:'12px'}},h('strong',{},m.full_name),h('span',{class:'muted small'},m.email||'Sin correo'),h('p',{},roles[m.member_role]),error,editable?field('Permiso',select):null,editable?h('div',{class:'row wrap'},save,remove):null));}
 el.append(h('h2',{},'Invitaciones pendientes'));
 if(!invitations.length)el.append(h('p',{class:'muted'},'No hay invitaciones pendientes.'));
 for(const i of invitations){const error=h('div',{class:'error-box',hidden:true});const cancel=h('button',{class:'btn danger',onclick:()=>guarded(cancel,error,async()=>{await del(`/api/companies/${id}/invitations/${i.id}`);location.reload();})},'Cancelar invitación');el.append(h('section',{class:'card stack',style:{marginBottom:'12px'}},h('strong',{},i.email||i.full_name),h('p',{},roles[i.member_role]),error,options.includes(i.member_role)?cancel:null));}
}
