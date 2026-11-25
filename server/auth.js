// Contraseñas (scrypt), sesiones seguras y límite de intentos de login.
import crypto from 'node:crypto';
import { HttpError } from './http.js';
import { ROLE_LABELS, permissionsOf } from './permissions.js';

const KEYLEN = 64;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEYLEN);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [alg, saltB64, hashB64] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// Hash ficticio para igualar tiempos cuando el usuario no existe.
export const DUMMY_HASH = hashPassword('no-existe-este-usuario');

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new HttpError(422, 'La contraseña debe tener al menos 8 caracteres', { field: 'password' });
  }
  if (password.length > 200) throw new HttpError(422, 'La contraseña es demasiado larga', { field: 'password' });
}

export function publicUser(u) {
  return {
    id: u.id, username: u.username, full_name: u.full_name, role: u.role,
    role_label: ROLE_LABELS[u.role], permissions: permissionsOf(u.role),
  };
}

const sqlTime = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

export async function createSession(db, userId, { ip, userAgent, days }) {
  const token = crypto.randomBytes(32).toString('base64url');
  (await db.prepare(`INSERT INTO sessions(token_hash, user_id, expires_at, ip, user_agent) VALUES (?,?,?,?,?)`)
    .run(sha256(token), userId, sqlTime(new Date(Date.now() + days * 864e5)), ip || null, (userAgent || '').slice(0, 200)));
  return token;
}

/** Devuelve el usuario de la sesión o null. Renueva la sesión si lleva más de 1 h sin uso. */
export async function resolveSession(db, token, days) {
  if (!token) return null;
  const hash = sha256(token);
  const row = (await db.prepare(`SELECT s.last_seen_at, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id
                          WHERE s.token_hash = ?`).get(hash));
  if (!row || !row.active) return null;
  if (row.expires_at <= sqlTime(new Date())) {
    (await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash));
    return null;
  }
  if (Date.now() - Date.parse(row.last_seen_at.replace(' ', 'T') + 'Z') > 36e5) {
    (await db.prepare(`UPDATE sessions SET last_seen_at = datetime('now'), expires_at = ? WHERE token_hash = ?`)
      .run(sqlTime(new Date(Date.now() + days * 864e5)), hash));
  }
  return { user: row, hash };
}

export const destroySession = async (db, token) => (await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token)));

export function makeLoginLimiter({ max = 8, windowMs = 15 * 60_000 } = {}) {
  const hits = new Map();
  return {
    check(key) {
      const e = hits.get(key);
      if (e && e.until > Date.now() && e.count >= max) {
        throw new HttpError(429, 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.');
      }
    },
    fail(key) {
      const now = Date.now();
      const e = hits.get(key);
      if (!e || e.until <= now) hits.set(key, { count: 1, until: now + windowMs });
      else e.count += 1;
    },
    reset: (key) => hits.delete(key),
  };
}
