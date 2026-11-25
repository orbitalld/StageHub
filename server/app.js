import { registerEventRoutes } from './routes/events.js';
import { companyRole, photoAllowed } from './company-access.js';
import { registerMembershipRoutes } from './routes/memberships.js';
// Construye la aplicación: base de datos, rutas, seguridad y archivos estáticos.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { openConfiguredDb, withDb, tx } from './db.js';
import { countUsers, createUser } from './users.js';
import { audit } from './audit.js';
import { checkStorage, getPhoto, photoType } from './storage.js';
import { HttpError, createRouter, readBody, parseCookies, sendJson, serveFile } from './http.js';
import { resolveSession } from './auth.js';
import { can, effectiveRole } from './permissions.js';
import { seedCatalog } from './seed.js';
import { snapshotStock } from './services/inventory.js';
import { PHOTO_RE, LOGO_RE } from './services/photos.js';
import { registerUserRoutes } from './routes/users.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerItemRoutes } from './routes/items.js';
import { registerCompanyRoutes } from './routes/companies.js';
import { registerSystemRoutes } from './routes/system.js';
import { registerDashboardRoutes } from './routes/dashboard.js';

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

export async function createApp(cfg) {
  if(Boolean(cfg.mailKey)!==Boolean(cfg.mailFrom)) throw new Error('Configura RESEND_API_KEY y STAGEHUB_MAIL_FROM juntos, o ninguno.');
  for (const d of [cfg.dataDir, cfg.uploadsDir, cfg.backupsDir]) fs.mkdirSync(d, { recursive: true });
  if(process.env.RENDER==='true' && !cfg.databaseUrl) throw new Error('DATABASE_URL es obligatoria en Render; no se permite SQLite efímero.');
  if(cfg.databaseUrl) await checkStorage(cfg);
  const db = await openConfiguredDb(cfg);
  try {
    await withDb(db,async()=>{
      await seedCatalog(db);
      for (const co of await db.prepare('SELECT id FROM companies WHERE deleted_at IS NULL').all()) await snapshotStock(db,co.id);
      if(cfg.databaseUrl && await countUsers(db)===0){
        if(!cfg.adminPassword) throw new Error('Define ADMIN_PASSWORD para crear el primer administrador de forma segura.');
        await tx(db,async()=>{const u=await createUser(db,{username:cfg.adminUsername,full_name:cfg.adminName,role:'master',password:cfg.adminPassword}); await audit(db,u,'crear','user',u.id,'Administrador inicial creado desde configuración del servidor');});
      }
    });
  } catch(e){await db.close();throw e;}
  // Un solo turno de base de datos por proceso; evita que una transacción se mezcle con otra.
  let queue=Promise.resolve();
  const queued=fn=>{const task=queue.then(()=>withDb(db,fn)); queue=task.catch(()=>{}); return task;};

  const ctx = { db, cfg };
  const router = createRouter();
  registerAuthRoutes(router, ctx);
  registerUserRoutes(router, ctx);
  registerCatalogRoutes(router, ctx);
  registerItemRoutes(router, ctx);
  registerDashboardRoutes(router, ctx);
  registerCompanyRoutes(router, ctx);
  registerMembershipRoutes(router,ctx);
  registerSystemRoutes(router,ctx);
  registerEventRoutes(router,ctx);

  const cookieBase = `Path=/; HttpOnly; SameSite=Lax${cfg.secureCookies ? '; Secure' : ''}`;

  async function handleApi(req, res, url) {
    const m = router.match(req.method, url.pathname);
    if (!m.route) throw new HttpError(m.pathMatched ? 405 : 404, m.pathMatched ? 'Método no permitido' : 'Ruta no encontrada');
    const { route, params } = m;

    const token = parseCookies(req.headers.cookie).sid;
    const session = (await resolveSession(db, token, cfg.sessionDays));
    const c = {
      req, params, query: Object.fromEntries(url.searchParams), body: {}, rawBody: null,
      user: session?.user ?? null, sessionHash: session?.hash ?? null, token,
      ip: req.socket.remoteAddress, status: 200,
      setSession(t, days) { res.setHeader('Set-Cookie', `sid=${t}; ${cookieBase}; Max-Age=${days * 86400}`); },
      clearSession() { res.setHeader('Set-Cookie', `sid=; ${cookieBase}; Max-Age=0`); },
    };

    if (route.opts.auth !== false) {
      if (!c.user) throw new HttpError(401, 'Debes iniciar sesión');
      if (route.opts.perm && !can(effectiveRole(c.user), route.opts.perm)) throw new HttpError(403, 'No tienes permiso para realizar esta acción');
    }
    // Defensa CSRF adicional a SameSite: toda escritura debe traer esta cabecera (los formularios de otros sitios no pueden enviarla).
    if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-requested-with'] !== 'stagehub') {
      throw new HttpError(403, 'Solicitud no autorizada');
    }

    if (route.opts.raw) {
      c.rawBody = await readBody(req, route.opts.raw);
    } else if (!['GET', 'HEAD', 'DELETE'].includes(req.method)) {
      const buf = await readBody(req, 1024 * 1024);
      if (buf.length) {
        try { c.body = JSON.parse(buf.toString('utf8')); } catch { throw new HttpError(400, 'El cuerpo no es JSON válido'); }
        if (c.body === null || typeof c.body !== 'object' || Array.isArray(c.body)) throw new HttpError(400, 'El cuerpo debe ser un objeto JSON');
      }
    }
    const result = await route.handler(c);
    sendJson(res, c.status, c.status === 204 ? undefined : result);
  }

  async function handleStatic(req, res, url) {
    if (!['GET', 'HEAD'].includes(req.method)) throw new HttpError(405, 'Método no permitido');
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch { throw new HttpError(400, 'Ruta inválida'); }

    if (rel.startsWith('/uploads/')) {
      const name = rel.slice('/uploads/'.length);
      const session = (await resolveSession(db, parseCookies(req.headers.cookie).sid, cfg.sessionDays));
      if (!session) throw new HttpError(401, 'Debes iniciar sesión');
      if (LOGO_RE.test(name)) {
        const co=await db.prepare('SELECT id FROM companies WHERE logo=?').get(name);
        if (!co || !(await companyRole(db,session.user,co.id))) throw new HttpError(404,'Archivo no encontrado');
        let data;
        if (cfg.databaseUrl) data=await getPhoto(cfg,name);
        else {try {data=fs.readFileSync(path.join(cfg.uploadsDir,name));} catch {throw new HttpError(404,'Archivo no encontrado');}}
        res.writeHead(200,{'Content-Type':photoType(name),'Content-Length':data.length,'Cache-Control':'private, no-store'});
        res.end(req.method==='HEAD'?undefined:data);return;
      }
      if (!PHOTO_RE.test(name) || !(await photoAllowed(db,session.user,name))) throw new HttpError(404,'Archivo no encontrado');
      if(cfg.databaseUrl){const data=await getPhoto(cfg,name); res.writeHead(200,{'Content-Type':photoType(name),'Content-Length':data.length,'Cache-Control':'private, no-store'}); res.end(req.method==='HEAD'?undefined:data);}
      else if (!serveFile(req, res, path.join(cfg.uploadsDir, name), { immutable: false })) throw new HttpError(404, 'Archivo no encontrado');
      return;
    }
    const file = path.normalize(path.join(cfg.publicDir, rel === '/' ? 'index.html' : rel));
    if (!file.startsWith(cfg.publicDir + path.sep)) throw new HttpError(403, 'Acceso denegado');
    if (!serveFile(req, res, file, {publicAsset:true,versioned:/^\d+\.\d+\.\d+$/.test(url.searchParams.get('v')||'')})) throw new HttpError(404, 'Archivo no encontrado');
  }

  const server = http.createServer(async (req, res) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname==='/healthz') {res.writeHead(200,{'Content-Type':'text/plain'});res.end('ok');return;}
      if (url.pathname.startsWith('/api/')) await queued(()=>handleApi(req,res,url));
      else if(decodeURIComponent(url.pathname).startsWith('/uploads/')) await queued(()=>handleStatic(req,res,url));
      else await handleStatic(req,res,url);
    } catch (err) {
      if (res.headersSent) return res.end();
      if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message, details: err.details });
      if (err.code==='23505' || /UNIQUE constraint failed/.test(err?.message || '')) return sendJson(res, 409, { error: 'Ya existe un registro con esos datos' });
      if (['23503','23514','23502','22001','22P02','22003'].includes(err.code) || /constraint failed/.test(err?.message || '')) return sendJson(res, 422, { error: 'Los datos no cumplen las reglas de integridad' });
      console.error(`[error] ${req.method} ${req.url}`, err.code || err.message);
      sendJson(res, 500, { error: 'Error interno del servidor' });
    }
  });

  return { server, db, cfg, close: async () => {await new Promise(r=>server.close(r)); await queue; await db.close();} };
}
