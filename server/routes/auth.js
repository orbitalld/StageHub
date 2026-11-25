import { HttpError } from '../http.js';
import { V } from '../validate.js';
import { tx } from '../db.js';
import { audit } from '../audit.js';
import { createSession, destroySession, verifyPassword, hashPassword, validatePassword, publicUser, DUMMY_HASH, makeLoginLimiter } from '../auth.js';
import { countUsers, createUser } from '../users.js';

export function registerAuthRoutes(router, { db, cfg }) {
  const limiter = makeLoginLimiter();
  const startSession = async (c, userId) => {
    const token = (await createSession(db, userId, { ip: c.ip, userAgent: c.req.headers['user-agent'], days: cfg.sessionDays }));
    c.setSession(token, cfg.sessionDays);
  };

  router.add('GET', '/api/auth/status', { auth: false }, async (c) => ({
    setup_required: (await countUsers(db)) === 0,
    user: c.user ? publicUser(c.user) : null,
  }));

  router.add('POST', '/api/auth/setup', { auth: false }, async (c) => {
    if(cfg.databaseUrl) throw new HttpError(403,'El administrador inicial se configura en el servidor');
    const user = (await tx(db, async () => {
      if ((await countUsers(db)) > 0) throw new HttpError(409, 'El sistema ya fue configurado');
      const u = (await createUser(db, { ...c.body, role: 'master' }));
      (await audit(db, u, 'crear', 'user', u.id, `Administrador inicial creado: ${u.username}`));
      return u;
    }));
    (await startSession(c, user.id));
    c.status = 201;
    return { user: publicUser(user) };
  });

  router.add('POST', '/api/auth/login', { auth: false }, async (c) => {
    const username = V.str(c.body, 'username', 'El usuario', { max: 254, required: true });
    const password = typeof c.body.password === 'string' ? c.body.password : '';
    const key = `${c.ip}|${username.toLowerCase()}`;
    limiter.check(key);
    const u = await db.prepare('SELECT * FROM users WHERE lower(email) = lower(?) OR lower(username) = lower(?)').get(username,username);
    const ok = password.length <= 200 && verifyPassword(password, u ? u.password_hash : DUMMY_HASH) && u;
    if (!ok) {
      limiter.fail(key);
      throw new HttpError(401, 'Usuario o contraseña incorrectos');
    }
    limiter.reset(key);
    if (u.approval_status !== 'approved' || !u.active) throw new HttpError(403, u.approval_status==='pending' ? 'Tu cuenta está pendiente de aprobación del Master. Si recibiste un código, verifica primero tu correo.' : 'Cuenta desactivada. Contacta al Master.');
    (await startSession(c, u.id));
    (await db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(u.id));
    (await audit(db, u, 'login', 'user', u.id, `Inicio de sesión: ${u.username}`));
    return { user: publicUser(u) };
  });

  router.add('POST', '/api/auth/logout', { auth: false }, async (c) => {
    if (c.token) (await destroySession(db, c.token));
    c.clearSession();
    c.status = 204;
  });

  router.add('POST', '/api/auth/change-password', async (c) => {
    const current = typeof c.body.current === 'string' ? c.body.current : '';
    if (!verifyPassword(current, c.user.password_hash)) {
      throw new HttpError(422, 'La contraseña actual no es correcta', { field: 'current' });
    }
    validatePassword(c.body.next);
    (await tx(db, async () => {
      (await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(c.body.next), c.user.id));
      (await db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(c.user.id, c.sessionHash));
      (await audit(db, c.user, 'editar', 'user', c.user.id, 'Cambio de contraseña'));
    }));
    c.status = 204;
  });
}
