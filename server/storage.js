// Supabase Storage privado. Las credenciales nunca llegan al navegador.
import { HttpError } from './http.js';
const types={jpg:'image/jpeg',png:'image/png',webp:'image/webp'};
export const photoType=name=>types[name.split('.').at(-1)]||'application/octet-stream';
function apiUrl(cfg, route){return `${cfg.supabaseUrl.replace(/\/$/,'')}/storage/v1/${route}`;}
async function request(cfg,route,options={}){
  const key=cfg.supabaseKey;
  const headers={apikey:key,...(!key.startsWith('sb_secret_')?{Authorization:`Bearer ${key}`}:{}) ,...options.headers};
  return fetch(apiUrl(cfg,route),{...options,headers,signal:AbortSignal.timeout(25000)});
}
const keyPath=(cfg,name)=>`${encodeURIComponent(cfg.storageBucket)}/${encodeURIComponent(name)}`;
export async function checkStorage(cfg){
  if(!cfg.supabaseUrl || !cfg.supabaseKey)throw new Error('Faltan SUPABASE_URL o SUPABASE_SECRET_KEY');
  if(new URL(cfg.supabaseUrl).protocol!=='https:')throw new Error('SUPABASE_URL debe usar HTTPS');
  const r=await request(cfg,`bucket/${encodeURIComponent(cfg.storageBucket)}`);
  if(!r.ok)throw new Error(`No se pudo acceder al bucket ${cfg.storageBucket} (HTTP ${r.status}). Créalo como privado y revisa las claves.`);
  const b=await r.json(); if(b.public)throw new Error('El bucket de StageHub debe ser privado');
}
export async function putPhoto(cfg,name,buf){
  const r=await request(cfg,`object/${keyPath(cfg,name)}`,{method:'POST',headers:{'Content-Type':photoType(name),'x-upsert':'false'},body:buf});
  if(!r.ok)throw new HttpError(502,`No se pudo guardar la imagen en Supabase (HTTP ${r.status})`);
}
export async function getPhoto(cfg,name){
  const r=await request(cfg,`object/authenticated/${keyPath(cfg,name)}`);
  if(!r.ok){ if([400,404].includes(r.status))throw new HttpError(404,'Archivo no encontrado'); throw new HttpError(502,'No se pudo recuperar la imagen de Supabase'); }
  return Buffer.from(await r.arrayBuffer());
}
export async function deletePhoto(cfg,name){
  const r=await request(cfg,`object/${encodeURIComponent(cfg.storageBucket)}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[name]})});
  if(!r.ok)throw new Error(`No se pudo borrar foto (HTTP ${r.status})`);
}
