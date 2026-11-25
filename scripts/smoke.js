// Comprueba una instalación ya publicada, creando y eliminando un equipo de prueba.
import assert from 'node:assert/strict';
const base=process.argv[2]?.replace(/\/$/,''); const username=process.env.ADMIN_USERNAME||'admin',password=process.env.ADMIN_PASSWORD;
if(!base||!password){console.error('Uso: npm run smoke -- https://TU-SERVICIO.onrender.com (ADMIN_PASSWORD en entorno o .env)');process.exit(1);}
let cookie='',id,photo;
async function call(method,url,body,raw){const headers={'X-Requested-With':'stagehub',...(cookie?{Cookie:cookie}:{}),...(raw?{'Content-Type':'image/png'}:body?{'Content-Type':'application/json'}:{})};const res=await fetch(base+url,{method,headers,body:raw|| (body?JSON.stringify(body):undefined),signal:AbortSignal.timeout(90000)});const s=res.headers.get('set-cookie');if(s)cookie=s.split(';')[0];const text=await res.text();assert.ok(res.ok,`${method} ${url}: HTTP ${res.status}: ${text.slice(0,200)}`);return text?JSON.parse(text):null;}
try{
 const st=await call('GET','/api/auth/status');assert.equal(st.setup_required,false);
 const login=await call('POST','/api/auth/login',{username,password});assert.equal(login.user.role,'master');
 const cats=await call('GET','/api/categories');assert.ok(cats.length);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jSioAAAAASUVORK5CYII=','base64');
 photo=(await call('POST','/api/uploads/photo',undefined,png)).photo;
 const i=await call('POST','/api/items',{name:`PRUEBA-STAGEHUB-${Date.now()}`,category_id:cats[0].id,tracking_mode:'individual',initial_units:2,photo});id=i.id;assert.equal(i.units.length,2);
 const image=await fetch(base+'/uploads/'+photo,{headers:{Cookie:cookie},signal:AbortSignal.timeout(90000)});assert.ok(image.ok);assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
 const u=await call('PUT',`/api/units/${i.units[0].id}`,{status:'mantenimiento',status_note:'Prueba temporal',unit_number:1});assert.equal(u.stock.maintenance,1);
 assert.ok((await call('GET',`/api/items/${id}/history`)).length);assert.ok((await call('GET','/api/dashboard')).totals);
 await call('DELETE',`/api/items/${id}`);id=undefined;await call('POST','/api/auth/logout');console.log('OK: login, catálogo, inventario, unidades, auditoría, panel y foto.');
}catch(e){console.error(e.message);process.exitCode=1;}finally{if(id){try{await call('DELETE',`/api/items/${id}`);}catch{console.error('Elimina manualmente el equipo de prueba ID',id);}}}
