import { test } from 'node:test';
import assert from 'node:assert/strict';
import companiesPage from '../public/js/pages/companies.js?v=0.4.5';
import { state } from '../public/js/state.js?v=0.4.5';

// DOM mínimo: append convierte null/undefined en texto, igual que el navegador.
class FakeNode {
  constructor(tag='',text=''){this.tag=tag;this.text=text;this.children=[];this.style={};this.attrs={};}
  append(...nodes){for(const n of nodes)this.children.push(n instanceof FakeNode?n:new FakeNode('#text',String(n)));}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(){}
  get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}
}
test('Empresas y dashboard no muestran null ni datos opcionales vacíos',async()=>{
  const previous={Node:globalThis.Node,document:globalThis.document,fetch:globalThis.fetch,user:state.user,companies:state.companies};
  globalThis.Node=FakeNode;
  globalThis.document={createElement:t=>new FakeNode(t),createTextNode:t=>new FakeNode('#text',t)};
  state.user={role:'master'};
  let companies=[{id:1,name:'Empresa A',member_role:'master',rut:null,contact:'   ',notes:'',logo:null,item_count:0,total:0}];
  globalThis.fetch=async url=>Response.json(url==='/api/companies'?companies:[]);
  try{
    for(const overview of [false,true]){
      let root=new FakeNode('main');await companiesPage(root,[],overview);
      assert.doesNotMatch(root.textContent,/null|undefined|RUT:|Contacto:/);
      assert.match(root.textContent,/Empresa A/);
      assert.match(root.textContent,/Unidades totales0/);
      assert.equal(root.children.some(c=>c.tag==='#text'),false);
    }
    companies=[{...companies[0],rut:'123',contact:'Contacto real',notes:'Nota real'}];
    let root=new FakeNode('main');await companiesPage(root,[],true);
    assert.match(root.textContent,/RUT: 123/);assert.match(root.textContent,/Contacto: Contacto real/);assert.match(root.textContent,/Nota real/);
    companies=[];
    for(const overview of [false,true]){
      root=new FakeNode('main');await companiesPage(root,[],overview);
      assert.match(root.textContent,/Todavía no tienes empresas/);
      assert.doesNotMatch(root.textContent,/null|undefined/);
    }
  }finally{globalThis.Node=previous.Node;globalThis.document=previous.document;globalThis.fetch=previous.fetch;state.user=previous.user;state.companies=previous.companies;}
});
