import { get, post, put } from '../api.js';
import { can, state, selectCompany } from '../state.js';
import { h, icon, badge, field, modal, guarded, fmtNum } from '../ui.js';

export default async function companiesPage(el) {
  const companies=await get('/api/companies');
  const write=can('companies:write');
  el.append(h('div',{class:'page-head'},h('div',{},h('h1',{},'Empresas'),h('div',{class:'sub'},'Gestiona un inventario independiente para cada empresa.')),h('div',{class:'spacer'}),write?h('button',{class:'btn primary',onclick:()=>edit()},icon('plus'),'Nueva empresa'):null),
    h('div',{class:'grid cols-2'},companies.map(c=>h('section',{class:'card stack company-card'},
      h('div',{class:'row wrap'},icon('building',22),h('h2',{style:{margin:0,overflowWrap:'anywhere'}},c.name),c.id===state.companyId?badge('Activa','ok'):null),
      c.rut?h('div',{class:'muted small'},`RUT: ${c.rut}`):null,
      c.contact?h('div',{class:'muted small'},`Contacto: ${c.contact}`):null,
      c.notes?h('p',{class:'muted',style:{margin:0,overflowWrap:'anywhere',whiteSpace:'pre-wrap'}},c.notes):null,
      h('div',{class:'grid cols-2'},h('div',{class:'kpi'},h('div',{class:'label'},'Referencias'),h('div',{class:'value'},fmtNum(c.item_count))),h('div',{class:'kpi'},h('div',{class:'label'},'Unidades totales'),h('div',{class:'value'},fmtNum(c.total)))),
      h('div',{class:'row wrap'},h('button',{class:'btn primary',onclick:()=>selectCompany(c.id)},icon('package'),'Administrar inventario'),write?h('button',{class:'btn',onclick:()=>edit(c)},icon('edit'),'Editar'):null)))));

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
