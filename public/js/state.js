export const state = { user: null };
export const can = (perm) => !!state.user && (state.user.permissions.includes('*') || state.user.permissions.includes(perm));
