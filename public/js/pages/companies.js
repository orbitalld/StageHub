import { get, post, put, api, del } from '../api.js?v=0.5.3';
import { roles } from './members.js?v=0.5.3';
import { can, state, selectCompany, refreshPage } from '../state.js?v=0.5.3';
import {appendSafe,  h, icon, badge, field, modal, guarded, fmtNum, toast, confirmDialog } from '../ui.js?v=0.5.3';

export default async function companiesPage(el, _params, overview=false) {
  const companies=await get('/api/companies');
  const write=can('companies:write');
  const hasText = value => value != null && String(value).trim() !== '' && !/^(?:null|undefined)+$/i.test(String(value).trim());
  const requests=overview?await get('/api/requests'):[];
  appendSafe(el,...[h('div',{class:'page-head'},h('div',{},h('h1',{},overview?'Panel principal':'Empresas'),h('div',{class:'sub'},overview?'Selecciona una empresa para acceder a su inventario.':'Gestiona un inventario independiente para cada empresa.')),h('div',{class:'spacer'}),write?h('a',{class:'btn',href:'#/companies/trash'},icon('trash'),'Papelera'):null,h('button',{class:'btn primary',onclick:()=>edit()},icon('plus'),'Nueva empresa')),
    overview?h('section',{class:'card row wrap',style:{marginBottom:'14px'}},h('div',{class:'stack',style:{flex:1}},h('strong',{},'Solicitudes de unión'),h('span',{class:'muted small'},`${requests.length} pendiente(s)`)),h('a',{class:'btn',href:'#/requests'},'Ver solicitudes')):null,
    !companies.length?h('p',{class:'muted'},'Todavía no tienes empresas. Crea la tuya o revisa tus solicitudes.'):null,
    h('div',{class:'grid cols-2'},companies.map(c=>h('section',{class:'card stack company-card'},
      h('div',{class:'row wrap'},companyLogo(c),h('h2',{style:{margin:0,overflowWrap:'anywhere'}},c.name),badge(roles[c.member_role]||'Miembro','info'),c.id===state.companyId?badge('Activa','ok'):null),
      hasText(c.rut)?h('div',{class:'muted small'},`RUT: ${c.rut}`):null,
      hasText(c.contact)?h('div',{class:'muted small'},`Contacto: ${c.contact}`):null,
      hasText(c.notes)?h('p',{class:'muted',style:{margin:0,overflowWrap:'anywhere',whiteSpace:'pre-wrap'}},c.notes):null,
      h('div',{class:'grid cols-2'},h('div',{class:'kpi'},h('div',{class:'label'},'Referencias'),h('div',{class:'value'},fmtNum(c.item_count))),h('div',{class:'kpi'},h('div',{class:'label'},'Unidades totales'),h('div',{class:'value'},fmtNum(c.total)))),
      h('div',{class:'row wrap'},h('button',{class:'btn primary',onclick:()=>selectCompany(c.id)},icon('package'),can('inventory:write',c.id)?'Administrar inventario':'Ver inventario'),h('button',{class:'btn',onclick:()=>selectCompany(c.id,'#/dashboard/company')},icon('dashboard'),'Estadísticas'),can('company:edit',c.id)?h('button',{class:'btn',onclick:()=>edit(c)},icon('edit'),'Editar'):null,can('members:write',c.id)?h('a',{class:'btn',href:`#/companies/${c.id}/members`},'Gestionar miembros'):null,write?h('button',{class:'btn',onclick:()=>editLogo(c)},icon('image'),c.logo?'Cambiar logo':'Agregar logo'):null,can('company:delete',c.id)?h('button',{class:'btn danger',onclick:()=>archive(c)},icon('trash'),'Eliminar empresa'):null))))].filter(node => node != null));

  async function archive(c) {
    if(!await confirmDialog({title:'Eliminar empresa',message:`¿Enviar ${c.name} a la papelera? Sus miembros perderán acceso hasta que el Master global la recupere. Se conservan equipos y fotografías.`,confirmText:'Eliminar empresa',danger:true}))return;
    try{await del(`/api/companies/${c.id}`);toast('Empresa enviada a papelera');refreshPage(overview?'#/dashboard':'#/companies');}catch(e){toast(e.message,'error');}
  }
  function companyLogo(c) {
    const fallback=()=>icon('building',30);
    const frame=h('div',{class:'company-logo'},fallback());
    if(c.logo) {
      const img=h('img',{src:`/uploads/${encodeURIComponent(c.logo)}`,alt:`Logo de ${c.name}`,onerror:()=>frame.replaceChildren(fallback())});
      frame.replaceChildren(img);
    }
    return frame;
  }
  function editLogo(c) {
    const file=h('input',{type:'file',accept:'image/png,image/jpeg,image/webp','aria-label':'Archivo del logo'});
    const err=h('div',{class:'error-box',hidden:true});
    const save=h('button',{class:'btn primary',type:'submit',form:'company-logo-form'},'Guardar logo');
    const remove=c.logo?h('button',{class:'btn danger',type:'button',onclick:async()=>{
      if(!await confirmDialog({title:'Quitar logo',message:`¿Quitar el logo de ${c.name}?`,confirmText:'Quitar logo',danger:true}))return;
      await guarded(remove,err,async()=>{save.disabled=true;try{await del(`/api/companies/${c.id}/logo`);finish('Logo eliminado');}finally{save.disabled=false;}});
    }},icon('trash'),'Quitar logo'):null;
    function finish(message){m.close();toast(message);refreshPage();}
    const m=modal({title:`Logo de ${c.name}`,body:h('form',{id:'company-logo-form',class:'stack',onsubmit:e=>{
      e.preventDefault();guarded(save,err,async()=>{
        const selected=file.files[0];
        if(!selected)throw new Error('Selecciona una imagen.');
        if(selected.size>2*1024*1024)throw new Error('El logo no puede superar 2 MB.');
        if(remove)remove.disabled=true;
        try{await api('POST',`/api/companies/${c.id}/logo`,undefined,{raw:selected});finish('Logo guardado');}
        finally{if(remove)remove.disabled=false;}
      });
    }},err,h('div',{class:'company-logo-preview'},companyLogo(c),h('span',{class:'muted small'},c.logo?'Logo actual':'Sin logo')),field('Seleccionar imagen',file,'JPG, PNG o WebP · máximo 2 MB. Se conserva la transparencia.')),footer:[h('button',{class:'btn',onclick:()=>m.close()},'Cancelar'),remove,save]});
  }
  function edit(c=null){
    const name=h('input',{required:true,maxlength:150,value:c?.name||''});
    const rut=h('input',{maxlength:30,value:c?.rut||''});
    const contact=h('input',{maxlength:150,value:c?.contact||''});
    const notes=h('textarea',{maxlength:1000,rows:3,value:c?.notes||''});
    const err=h('div',{class:'error-box',hidden:true});
    const save=h('button',{class:'btn primary',form:'company-form',type:'submit'},c?'Guardar cambios':'Crear empresa');
    const m=modal({title:c?'Editar empresa':'Nueva empresa',body:h('form',{id:'company-form',class:'stack',onsubmit:e=>{
      e.preventDefault();guarded(save,err,async()=>{const body={name:name.value,rut:rut.value,contact:contact.value,notes:notes.value};
      if(c){await put(`/api/companies/${c.id}`,body);m.close();refreshPage();}
      else{const created=await post('/api/companies',body);m.close();selectCompany(created.id);}});
    }},err,field('Nombre de la empresa',name),field('RUT (opcional)',rut),field('Contacto (opcional)',contact),field('Observaciones (opcional)',notes)),footer:[h('button',{class:'btn',onclick:()=>m.close()},'Cancelar'),save]});
  }
}

export const overviewPage = (el,params) => companiesPage(el,params,true);

export async function trashPage(el){
  if(!can('companies:write'))throw new Error('Solo el Master global puede acceder a la papelera');
  const rows=await get('/api/companies/trash');
  appendSafe(el,h('a',{class:'btn ghost',href:'#/companies'},'Volver a empresas'),h('h1',{},'Papelera de empresas'),h('p',{class:'muted'},'Las empresas eliminadas conservan inventario, fotografías, logos y miembros. Solo el Master puede recuperarlas. Las invitaciones pendientes se cancelan.'));
  if(!rows.length)appendSafe(el,h('p',{class:'muted'},'No hay empresas eliminadas.'));
  for(const c of rows){
    const err=h('div',{class:'error-box',hidden:true});
    const restore=h('button',{class:'btn primary',onclick:()=>guarded(restore,err,async()=>{
      if(!await confirmDialog({title:'Recuperar empresa',message:`¿Restaurar ${c.name} y devolver el acceso a sus miembros?`,confirmText:'Recuperar empresa'}))return;
      await post(`/api/companies/${c.id}/restore`);toast('Empresa recuperada');refreshPage();
    })},'Recuperar empresa');
    appendSafe(el,h('section',{class:'card stack',style:{marginBottom:'12px'}},h('h2',{},c.name),h('p',{},`${fmtNum(c.item_count)} referencias · Eliminada: ${c.deleted_at}`),c.deleted_by_name?h('p',{class:'muted'},`Por: ${c.deleted_by_name}`):null,err,restore));
  }
}
