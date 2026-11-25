import { get, post } from './api.js';
import { state, selectCompany, can } from './state.js';
import { h, icon, clear, toast, modal, field, guarded } from './ui.js';
import dashboardPage from './pages/dashboard.js';
import inventoryPage from './pages/inventory.js';
import itemPage from './pages/item.js';
import categoriesPage from './pages/categories.js';
import companiesPage, { overviewPage } from './pages/companies.js';
import usersPage from './pages/users.js';

const root = document.getElementById('app');

const ROUTES = [
  [/^#\/companies$/, companiesPage, 'companies'],
  [/^#\/dashboard$/, overviewPage, 'dashboard'],
  [/^#\/dashboard\/company$/, dashboardPage, 'dashboard'],
  [/^#\/users$/, usersPage, 'users'],
  [/^#\/inventory$/, inventoryPage, 'inventory'],
  [/^#\/inventory\/(\d+)$/, itemPage, 'inventory'],
  [/^#\/categories$/, categoriesPage, 'categories'],
];
const NAV = [
  ['dashboard', 'Panel principal', 'dashboard', '#/dashboard'],
  ['companies', 'Empresas', 'building', '#/companies'],
  ['users', 'Administración de usuarios', 'lock', '#/users'],
  ['inventory', 'Inventario', 'package', '#/inventory'],
  ['categories', 'Categorías', 'tag', '#/categories'],
];

async function boot() {
  let status;
  try { status = await get('/api/auth/status'); }
  catch (e) { return renderFatal(e.message); }
  if (status.setup_required) return renderAuth('setup');
  if (!status.user) return renderAuth('login');
  state.user = status.user;
  renderShell();
}

function renderFatal(msg) {
  clear(root).append(h('div', { class: 'login-wrap' }, h('div', { class: 'card login-card stack' },
    h('h1', {}, 'No se pudo conectar'), h('p', { class: 'muted' }, msg),
    h('button', { class: 'btn primary', onclick: boot }, 'Reintentar'))));
}

function renderAuth(mode, notice='', initialEmail='') {
  content=null; navLinks=null;
  const setup=mode==='setup', registering=mode==='register', verifying=mode==='verify';
  const err=h('div',{class:'error-box',hidden:true});
  const info=notice?h('p',{class:'muted',role:'status'},notice):null;
  const user=h('input',{type:registering||verifying?'email':'text',autocomplete:registering||verifying?'email':'username',required:true,autocapitalize:'none',maxlength:254,value:initialEmail});
  const name=h('input',{type:'text',autocomplete:'name',required:true,maxlength:100});
  const pass=h('input',{type:'password',autocomplete:setup||registering?'new-password':'current-password',required:true,maxlength:200});
  const pass2=h('input',{type:'password',autocomplete:'new-password',required:true});
  const code=h('input',{type:'text',autocomplete:'one-time-code',autocapitalize:'none',required:true,maxlength:100});
  const btn=h('button',{class:'btn primary',type:'submit',style:{justifyContent:'center'}},setup?'Crear Master y entrar':registering?'Registrarme':verifying?'Verificar correo':'Entrar');
  const form=h('form',{class:'stack',onsubmit:e=>{e.preventDefault();guarded(btn,err,async()=>{
    if((setup||registering)&&pass.value!==pass2.value)throw new Error('Las contraseñas no coinciden');
    if(registering){const r=await post('/api/auth/register',{email:user.value,full_name:name.value,password:pass.value});return renderAuth(r.verification_required?'verify':'login',r.message,user.value);}
    if(verifying){const r=await post('/api/auth/verify-email',{email:user.value,code:code.value});return renderAuth('login',r.message,user.value);}
    const r=await post(setup?'/api/auth/setup':'/api/auth/login',setup?{username:user.value,full_name:name.value,password:pass.value}:{username:user.value,password:pass.value});
    state.user=r.user;location.hash='#/dashboard';renderShell();
  });}},err,info,field(setup?'Usuario':registering||verifying?'Correo electrónico':'Correo electrónico o usuario',user),setup||registering?field('Nombre completo',name):null,
    verifying?field('Código recibido por correo',code):field('Contraseña',pass,setup||registering?'Mínimo 8 caracteres.':null),setup||registering?field('Repetir contraseña',pass2):null,btn);
  const resend=h('button',{class:'btn',type:'button',onclick:()=>guarded(resend,err,async()=>{const r=await post('/api/auth/resend-email',{email:user.value});renderAuth('verify',r.message,user.value);})},'Reenviar código');
  clear(root).append(h('div',{class:'login-wrap'},h('div',{class:'card login-card stack'},
    h('div',{class:'brand',style:{padding:0}},h('i',{},'S'),'StageHub'),
    h('div',{},h('h1',{},setup?'Configuración inicial':registering?'Crear cuenta':verifying?'Verificar correo':'Iniciar sesión'),h('p',{class:'muted',style:{margin:'4px 0 0'}},registering?'Las cuentas nuevas necesitan aprobación del Master.':'Inventario y producción técnica de eventos.')),form,
    verifying?resend:null,
    !setup?h('div',{class:'row wrap'},mode!=='login'?h('button',{class:'btn ghost',onclick:()=>renderAuth('login')},'Volver al inicio de sesión'):null,mode!=='register'?h('button',{class:'btn ghost',onclick:()=>renderAuth('register')},'Crear cuenta'):null,mode!=='verify'?h('button',{class:'btn ghost',onclick:()=>renderAuth('verify')},'Verificar correo'):null):null)));
  if(!window.matchMedia('(max-width: 860px), (pointer: coarse)').matches)user.focus();
}

let renderToken = 0;
let shell, content, navLinks;

async function renderShell() {
  try { state.companies = await get('/api/companies'); } catch(e){return renderFatal(e.message);}
  const stored=Number(sessionStorage.getItem('stagehub-company') || 1);
  state.companyId=state.companies.some(c=>c.id===stored)?stored:state.companies[0]?.id || 1;
  navLinks = {};
  const nav = h('nav', { class: 'nav' }, NAV.filter(([key])=>key!=='users'||can('users:write')).map(([key, label, ic, href]) => {
    const a = h('a', { href, onclick: () => shell.classList.remove('drawer') }, icon(ic), label);
    navLinks[key] = a;
    return a;
  }));
  content = h('main', { class: 'content', id: 'content' });
  shell = h('div', { class: 'shell' },
    h('aside', { class: 'sidebar' },
      h('div', { class: 'brand' }, h('i', {}, 'S'), 'StageHub'), nav,
      h('div', { class: 'side-foot stack', style: { gap: '8px' } },
        h('div', { style: { padding: '0 10px' } }, h('div', { style: { fontWeight: 550 } }, state.user.full_name), h('div', { class: 'muted small' }, state.user.role_label)),
        h('button', { class: 'btn ghost', onclick: changePasswordDialog }, icon('lock'), 'Cambiar contraseña'),
        h('button', { class: 'btn ghost', onclick: logout }, icon('logout'), 'Cerrar sesión'))),
    h('div', { class: 'main' },
      h('div', { class: 'topbar' },
        h('button', { class: 'icon-btn', 'aria-label': 'Menú', onclick: () => shell.classList.toggle('drawer') }, icon('menu')),
        h('div', { class: 'brand', style: { padding: 0 } }, h('i', {}, 'S'), 'StageHub')),
      h('div', {class:'company-bar'}, h('label',{for:'company-select'},'Empresa activa'),
        h('select',{id:'company-select',value:String(state.companyId),onchange:e=>selectCompany(Number(e.target.value),location.hash==='#/dashboard/company'?'#/dashboard/company':'#/inventory')},state.companies.map(c=>h('option',{value:String(c.id)},c.name))),
        h('a',{class:'btn ghost',href:'#/companies'},icon('building'),'Empresas')),
      content),
    h('div', { class: 'scrim', onclick: () => shell.classList.remove('drawer') }));
  clear(root).append(shell);
  route();
}

async function route() {
  if (!state.user || !content || !navLinks) return;
  const hash = location.hash || '#/dashboard';
  const match = ROUTES.map(([re, page, nav]) => [re.exec(hash), page, nav]).find(([m]) => m);
  if (!match) { location.hash = '#/dashboard'; return; }
  const [m, page, nav] = match;
  for (const [k, a] of Object.entries(navLinks)) a.classList.toggle('active', k === nav);
  const mine = ++renderToken;
  clear(content).append(h('p', { class: 'muted' }, 'Cargando…'));
  const target = h('div', {});
  try {
    await page(target, m.slice(1));
    if (mine !== renderToken) return;
    clear(content).append(target);
    window.scrollTo(0, 0);
  } catch (e) {
    if (mine !== renderToken) return;
    clear(content).append(h('div', { class: 'card empty' }, h('h2', {}, 'No se pudo cargar la página'), h('p', {}, e.message),
      h('button', { class: 'btn', onclick: route }, 'Reintentar')));
  }
}

async function logout() {
  try { await post('/api/auth/logout'); } catch { /* sesión ya caducada */ }
  state.user = null;
  sessionStorage.removeItem('stagehub-company');
  renderAuth('login');
}

function changePasswordDialog() {
  const err = h('div', { class: 'error-box', hidden: true });
  const cur = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const nw = h('input', { type: 'password', autocomplete: 'new-password', required: true });
  const nw2 = h('input', { type: 'password', autocomplete: 'new-password', required: true });
  const save = h('button', { class: 'btn primary', type: 'submit', form: 'pwform' }, 'Guardar');
  const m = modal({ title: 'Cambiar contraseña',
    body: h('form', { id: 'pwform', class: 'stack', onsubmit: (e) => { e.preventDefault();
      guarded(save, err, async () => {
        if (nw.value !== nw2.value) throw new Error('Las contraseñas nuevas no coinciden');
        await post('/api/auth/change-password', { current: cur.value, next: nw.value });
        m.close(); toast('Contraseña actualizada');
      }); } }, err, field('Contraseña actual', cur), field('Contraseña nueva', nw, 'Mínimo 8 caracteres.'), field('Repetir contraseña nueva', nw2)),
    footer: [h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cancelar'), save] });
}

window.addEventListener('hashchange', route);
window.addEventListener('session-expired', () => { if (state.user) { state.user = null; toast('Tu sesión expiró. Inicia sesión de nuevo.', 'error'); renderAuth('login'); } });
boot();
