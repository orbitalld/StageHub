import { state } from './state.js?v=0.4.7';
// Cliente HTTP: toda comunicación pasa por el backend, que valida y aplica las reglas.
export class ApiError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

export async function api(method, url, body, { raw } = {}) {
  const opts = { method, headers: { 'X-Requested-With': 'stagehub', 'X-StageHub-Company': String(state.companyId) }, credentials: 'same-origin' };
  if (raw) { opts.body = raw; opts.headers['Content-Type'] = raw.type; }
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(url, opts); } catch { throw new ApiError(0, 'Sin conexión con el servidor. Comprueba tu conexión a Internet e inténtalo de nuevo.'); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/')) window.dispatchEvent(new Event('session-expired'));
    throw new ApiError(res.status, data?.error || 'Error inesperado', data?.details);
  }
  return data;
}
export const get = (u) => api('GET', u);
export const post = (u, b) => api('POST', u, b ?? {});
export const put = (u, b) => api('PUT', u, b ?? {});
export const del = (u) => api('DELETE', u);
