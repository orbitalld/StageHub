export const state = { user: null, companies: [], companyId: 1 };
export function can(perm,id=state.companyId){
 if(!state.user)return false;
 if(state.user.role==='master')return true;
 const role=state.companies.find(c=>c.id===id)?.member_role;
 if(perm==='inventory:read')return !!role;
 if(['inventory:write','audit:read'].includes(perm))return ['inventory','manager','owner'].includes(role);
 if(perm==='members:write')return ['members','manager','owner'].includes(role);
 if(perm==='company:edit')return role==='owner';
 return false;
}
export const companyName = () => state.companies.find(c=>c.id===state.companyId)?.name || 'Empresa principal';
export function selectCompany(id, page='#/inventory') {
  // Recargar evita que una edición pendiente de la empresa anterior use el nuevo contexto.
  sessionStorage.setItem('stagehub-company',String(id));
  location.hash=page;
  location.reload();
}
