// Utilidades HTTP mínimas: router, errores, cuerpo, cookies, archivos estáticos.
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync, brotliCompressSync, constants} from 'node:zlib';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function createRouter() {
  const routes = [];
  return {
    add(method, pattern, opts, handler) {
      if (typeof opts === 'function') { handler = opts; opts = {}; }
      const keys = [];
      const re = new RegExp('^' + pattern.replace(/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
      routes.push({ method, re, keys, opts, handler });
    },
    match(method, pathname) {
      let pathMatched = false;
      for (const r of routes) {
        const m = r.re.exec(pathname);
        if (!m) continue;
        pathMatched = true;
        if (r.method !== method) continue;
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        return { route: r, params };
      }
      return { pathMatched };
    },
  };
}

export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { tooBig = true; return; }
      chunks.push(c);
    });
    req.on('end', () => (tooBig ? reject(new HttpError(413, 'El contenido enviado es demasiado grande')) : resolve(Buffer.concat(chunks))));
    req.on('error', reject);
  });
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sendJson(res, status, data) {
  const body = data === undefined ? '' : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
};

// Caché acotada de compresión: únicamente recursos públicos, nunca fotos ni API privada.
const compressed = new Map();
const encodings = header => String(header || '').toLowerCase().split(',').map(x=>{
  const [name,...params]=x.trim().split(';');
  const q=params.find(p=>p.trim().startsWith('q='));
  return [name.trim(),q?Number(q.trim().slice(2)):1];
});
function chooseEncoding(header){
  const entries=new Map(encodings(header));
  const quality=name=>entries.get(name)??entries.get('*')??0;
  const br=quality('br'),gz=quality('gzip');
  return br>0&&br>=gz?'br':gz>0?'gzip':null;
}
/** Sirve un archivo con ETag. Devuelve false si no existe. */
export function serveFile(req, res, file, { publicAsset = false, versioned = false } = {}) {
  let st;
  try { st = fs.statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  const ext=path.extname(file).toLowerCase();
  const compressible=publicAsset&&st.size>=512&&st.size<=1024*1024&&['.html','.js','.css','.json','.webmanifest','.svg'].includes(ext);
  const encoding=compressible?chooseEncoding(req.headers['accept-encoding']):null;
  const etag = `W/"${st.size}-${Math.floor(st.mtimeMs)}${encoding?'-'+encoding:''}"`;
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': !publicAsset?'private, no-store':versioned&&ext!=='.html'?'public, max-age=86400':'no-cache',
    ETag: etag,
  };
  if(compressible) headers.Vary='Accept-Encoding';
  if(encoding) headers['Content-Encoding']=encoding;
  if (publicAsset&&req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return true; }
  if(encoding){
    const key=file+'|'+etag;let data=compressed.get(key);
    if(!data){const raw=fs.readFileSync(file);data=encoding==='br'?brotliCompressSync(raw,{params:{[constants.BROTLI_PARAM_QUALITY]:4}}):gzipSync(raw,{level:6});
      if(compressed.size>=64)compressed.delete(compressed.keys().next().value);compressed.set(key,data);}
    headers['Content-Length']=data.length;res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:data);return true;
  }
  headers['Content-Length'] = st.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') { res.end(); return true; }
  fs.createReadStream(file).pipe(res);
  return true;
}
