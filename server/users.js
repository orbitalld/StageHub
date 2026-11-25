import { HttpError } from './http.js';
import { V } from './validate.js';
import { hashPassword, validatePassword } from './auth.js';
import { ROLE_LABELS, legacyRole } from './permissions.js';

export async function countUsers(db) {
  return (await db.prepare('SELECT COUNT(*) AS n FROM users').get()).n;
}

export async function createUser(db, input) {
  const username = V.str(input, 'username', 'El usuario', { max: 40, required: true });
  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) {
    V.fail('username', 'El usuario debe tener 3-40 caracteres (letras, números, punto, guion)');
  }
  const full_name = V.str(input, 'full_name', 'El nombre', { max: 100, required: true });
  const role = V.oneOf({...input,role:({bodega:'admin',supervisor:'user',tecnico:'user',consulta:'user'})[input.role] || input.role}, 'role', 'El rol', Object.keys(ROLE_LABELS));
  validatePassword(input.password);
  if ((await db.prepare('SELECT 1 FROM users WHERE username = ?').get(username))) {
    throw new HttpError(409, 'Ya existe un usuario con ese nombre', { field: 'username' });
  }
  const values=[username,full_name,hashPassword(input.password),legacyRole(role),role];
  // SQLite reutiliza el último ROWID eliminado; evita asociar auditorías antiguas a cuentas nuevas.
  const r = db.dialect==='postgres'
    ? await db.prepare('INSERT INTO users(username, full_name, password_hash, role, access_role) VALUES (?,?,?,?,?)').run(...values)
    : await db.prepare(`INSERT INTO users(id,username,full_name,password_hash,role,access_role)
      SELECT MAX(COALESCE((SELECT MAX(id) FROM users),0),COALESCE((SELECT MAX(entity_id) FROM audit_log WHERE entity='user'),0))+1,?,?,?,?,?`).run(...values);
  return (await db.prepare('SELECT * FROM users WHERE id = ?').get(Number(r.lastInsertRowid)));
}
