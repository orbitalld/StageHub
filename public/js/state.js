export const state = { user: null, companies: [], companyId: 1 };
export const can = (perm) => !!state.user && (state.user.permissions.includes('*') || state.user.permissions.includes(perm));
export const companyName = () => state.companies.find(c=>c.id===state.companyId)?.name || 'Empresa principal';
export function selectCompany(id, page='#/inventory') {
  // Recargar evita que una edición pendiente de la empresa anterior use el nuevo contexto.
  sessionStorage.setItem('stagehub-company',String(id));
  location.hash=page;
  location.reload();
}
