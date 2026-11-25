import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appendSafe, h, joinText, replaceSafe} from '../public/js/ui.js?v=0.5.2';
import {commitView} from '../public/js/view-refresh.js?v=0.5.2';
import {eventRequestsSection} from '../public/js/pages/events.js?v=0.5.2';

class FakeNode extends EventTarget {
  constructor(tag='',text=''){super();this.tagName=tag.toUpperCase();this.children=[];this._text=text;this.dataset={};this.attrs={};this.style={};this.classList={toggle(){},remove(){},add(){}};this.value='';this.open=false;}
  get childNodes(){return this.children;}
  get options(){return this.children.filter(c=>c.tagName==='OPTION');}
  get firstChild(){return this.children[0];}
  get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
  set textContent(v){this._text=String(v);this.children=[];}
  append(...nodes){for(let n of nodes){if(!(n instanceof FakeNode))n=new FakeNode('#text',String(n));n.remove();n.parent=this;this.children.push(n);}}
  replaceChildren(...nodes){for(const n of this.children)n.parent=null;this.children=[];this._text='';this.append(...nodes);}
  remove(){if(this.parent){const i=this.parent.children.indexOf(this);if(i!==-1)this.parent.children.splice(i,1);this.parent=null;}}
  setAttribute(k,v){this.attrs[k]=String(v);if(k==='value')this.value=String(v);if(k==='data-refresh-key')this.dataset.refreshKey=String(v);if(k==='data-refresh-control')this.dataset.refreshControl=String(v);}
  removeAttribute(k){delete this.attrs[k];}
  get isConnected(){return !!this.parent||this.tagName==='BODY';}
  querySelectorAll(sel){const match=n=>sel==='details[data-refresh-key]'?n.tagName==='DETAILS'&&!!n.dataset.refreshKey:sel==='[data-refresh-control]'?!!n.dataset.refreshControl:sel==='main'?n.tagName==='MAIN':false;return this.children.flatMap(n=>[...(match(n)?[n]:[]),...n.querySelectorAll(sel)]);}
}
const root=new FakeNode('div'), body=new FakeNode('body');body.append(root);
globalThis.Node=FakeNode;
globalThis.document={createElement:t=>new FakeNode(t),createTextNode:t=>new FakeNode('#text',t),getElementById:()=>root,body,visibilityState:'visible'};

test('append y replace seguros omiten null, undefined y marcadores vacíos; preservan cero, texto y elementos',()=>{
  const target=new FakeNode('main');appendSafe(target,h('p',{},'Equipo'),null,[undefined,false,'nullnull',0,'Detalle']);
  assert.equal(target.textContent,'Equipo0Detalle');
  assert.equal(joinText([null,'Audio',undefined,'  ','null',0]),'Audio · 0');
  replaceSafe(target,null,h('p',{},'Nuevo'),undefined,'undefined');assert.equal(target.textContent,'Nuevo');
  assert.equal(h('p',{},null,'undefined',0).textContent,'0');
});
test('solicitudes de equipos con y sin resultados no muestran null',async()=>{
  const original=globalThis.fetch;
  try {
    for(const rows of [[],[{id:1,item_name:'Beam',event_name:'Evento',requested:2,available:3,departure:'2026-12-01T10:00:00Z',return_at:'2026-12-03T10:00:00Z'}]]){
      globalThis.fetch=async url=>Response.json(url==='/api/events/requests'?rows:[]);
      const target=new FakeNode('main');await eventRequestsSection(target);
      assert.doesNotMatch(target.textContent,/null|undefined/);assert.match(target.textContent,rows.length?/Beam/:/Sin solicitudes/);
    }
  } finally {globalThis.fetch=original;}
});
test('reemplazo de vista conserva scroll, checklists abiertos y filtros; navegación nueva vuelve arriba',()=>{
  const host=h('main',{},h('details',{'data-refresh-key':'checklist-1'}),h('input',{'data-refresh-control':'search',value:'Beam'}));
  host.children[0].open=true;
  const next=h('div',{},h('details',{'data-refresh-key':'checklist-1'}),h('input',{'data-refresh-control':'search',value:''}));
  const positions=[];const viewport={scrollX:0,scrollY:930,scrollTo:p=>positions.push(p)};
  commitView(host,next,true,viewport);
  assert.equal(next.children[0].open,true);assert.equal(next.children[1].value,'Beam');assert.equal(positions[0].top,930);assert.equal(host.children[0],next);
  commitView(host,h('div',{},'otra página'),false,viewport);assert.equal(positions[1].top,0);
});
test('router real: una actualización lenta de eventos no vacía la pantalla, conserva scroll y descarta respuestas antiguas',async()=>{
  const window=new EventTarget();Object.assign(window,{scrollX:0,scrollY:0,scrollTo(p){this.scrollY=p.top;}});globalThis.window=window;
  globalThis.location={hash:'#/events'};globalThis.sessionStorage={getItem:()=>null,setItem(){},removeItem(){}};
  const originalInterval=globalThis.setInterval,originalFetch=globalThis.fetch;globalThis.setInterval=(...args)=>{const id=originalInterval(...args);id.unref();return id;};
  let pending=[], delay=false;
  const user={id:1,role:'master',full_name:'Master',role_label:'Master'}, companies=[{id:1,name:'Empresa',member_role:'master'}];
  const event=name=>({id:1,company_id:1,company_name:'Empresa',name,status:'draft',start_at:'2026-12-01T12:00:00Z',return_at:'2026-12-02T12:00:00Z',totals:{requested:0,available:0,deficit:0,reserved:0,out:0},lines:[]});
  globalThis.fetch=async url=>{
    if(url==='/api/auth/status')return Response.json({user});if(url==='/api/companies')return Response.json(companies);
    if(url==='/api/system/version')return Response.json({installed:'0.5.2'});
    if(url==='/api/events/companies')return Response.json([{id:1,name:'Empresa',permissions:['create']}]);if(url==='/api/events/occupancy')return Response.json({percent:0});
    if(url==='/api/events'){if(!delay)return Response.json([event('Evento inicial')]);return new Promise(resolve=>pending.push(name=>resolve(Response.json([event(name)]))));}
    throw new Error('URL inesperada '+url);
  };
  const wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}assert.fail('La vista no terminó de actualizar');};
  try{
    await import('../public/js/main.js?v=0.5.2');await wait(()=>root.textContent.includes('Evento inicial'));
    assert.doesNotMatch(root.textContent,/null|undefined/);
    const main=root.querySelectorAll('main')[0];window.scrollY=780;delay=true;
    window.dispatchEvent(new Event('stagehub:refresh'));await wait(()=>pending.length===1);
    assert.match(main.textContent,/Evento inicial/);assert.equal(main.attrs['aria-busy'],'true');
    window.dispatchEvent(new Event('stagehub:refresh'));await wait(()=>pending.length===2);
    pending[1]('Evento actualizado');await wait(()=>main.textContent.includes('Evento actualizado'));
    assert.equal(root.querySelectorAll('main')[0],main);assert.equal(window.scrollY,780);assert.equal(main.attrs['aria-busy'],undefined);
    pending[0]('Respuesta antigua');await new Promise(r=>setTimeout(r,20));assert.doesNotMatch(main.textContent,/Respuesta antigua/);assert.match(main.textContent,/Evento actualizado/);
  }finally{globalThis.setInterval=originalInterval;globalThis.fetch=originalFetch;}
});
