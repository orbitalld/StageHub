// Matriz de permisos por rol. Se amplía en cada fase sin tocar las rutas existentes.
export const ROLE_LABELS = {
  admin: 'Administrador',
  bodega: 'Encargado de bodega',
  supervisor: 'Supervisor',
  tecnico: 'Técnico',
  consulta: 'Usuario de consulta',
};

const PERMISSIONS = {
  admin: ['*'],
  bodega: ['inventory:read', 'inventory:write', 'categories:write', 'audit:read'],
  supervisor: ['inventory:read', 'audit:read'],
  tecnico: ['inventory:read'],
  consulta: ['inventory:read'],
};

export const permissionsOf = (role) => PERMISSIONS[role] || [];
export const can = (role, perm) => {
  const p = permissionsOf(role);
  return p.includes('*') || p.includes(perm);
};
