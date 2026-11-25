export const ROLE_LABELS = { user: 'Usuario', admin: 'Administrador', master: 'Master' };
export const legacyRole = role => ({master:'admin',admin:'bodega',user:'consulta'})[role];
export const effectiveRole = u => u.access_role || ({admin:'master',bodega:'admin',supervisor:'user',tecnico:'user',consulta:'user'})[u.role] || 'user';
const PERMISSIONS = {
  master: ['*'],
  admin: [],
  user: [],
};
export const permissionsOf = role => PERMISSIONS[role] || [];
export const can = (role,perm) => permissionsOf(role).includes('*') || permissionsOf(role).includes(perm);
