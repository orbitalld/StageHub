import { get, post, put, api, del } from '../api.js';
import { can, state, selectCompany } from '../state.js';
import { h, icon, badge, field, modal, guarded, fmtNum, toast, confirmDialog } from '../ui.js';

export default async function companiesPage(el, _params, overview=false) {
  const companies=await get('/api/companies');
  const write=can('companies:write');
  el.append(h('div',{class:'page-head'},h('div',{},h('h1',{},overview?'Panel principal':'Empresas'),h('div',{class:'sub'},overview?'Selecciona una empresa para acceder a su inventario.':'Gestiona un inventario independiente para cada empresa.')),h('div',{class:'spacer'}),write?h('button',{class:'btn primary',onclick:()=>edit()},icon('plus'),'Nueva empresa'):null),
    h('div',{class:'grid cols-2'},companies.map(c=>h('section',{class:'card stack company-card'},
      h('div',{class:'row wrap'},companyLogo(c),h('h2',{style:{margin:0,overflowWrap:'anywhere'}},c.name),c.id===state.companyId?badge('Activa','ok'):null),
      c.rut?h('div',{class:'muted small'},`RUT: ${c.rut}`):null,
      c.contact?h('div',{class:'muted small'},`Contacto: ${c.contact}`):null,
      c.notes?h('p',{class:'muted',style:{margin:0,overflowWrap:'anywhere',whiteSpace:'pre-wrap'}},c.notes):null,
      h('div',{class:'grid cols-2'},h('div',{class:'kpi'},h('div',{class:'label'},'Referencias'),h('div',{class:'value'},fmtNum(c.item_count))),h('div',{class:'kpi'},h('div',{class:'label'},'Unidades totales'),h('div',{class:'value'},fmtNum(c.total)))),
      h('div',{class:'row wrap'},h('button',{class:'btn primary',onclick:()=>selectCompany(c.id)},icon('package'),can('inventory:write')?'Administrar inventario':'Ver inventario'),h('button',{class:'btn',onclick:()=>selectCompany(c.id,'#/dashboard/company')},icon('dashboard'),'Estadísticas'),write?h('button',{class:'btn',onclick:()=>edit(c)},icon('edit'),'Editar'):null,write?h('button',{class:'btn',onclick:()=>editLogo(c)},icon('image'),c.logo?'Cambiar logo':'Agregar logo'):null)))));

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
    function finish(message){m.close();toast(message);selectCompany(state.companyId,overview?'#/dashboard':'#/companies');}
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
      if(c){await put(`/api/companies/${c.id}`,body);m.close();selectCompany(state.companyId,'#/companies');}
      else{const created=await post('/api/companies',body);m.close();selectCompany(created.id);}});
    }},err,field('Nombre de la empresa',name),field('RUT (opcional)',rut),field('Contacto (opcional)',contact),field('Observaciones (opcional)',notes)),footer:[h('button',{class:'btn',onclick:()=>m.close()},'Cancelar'),save]});
  }
}

export const overviewPage = (el,params) => companiesPage(el,params,true);
