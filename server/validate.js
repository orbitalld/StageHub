// Validadores de entrada. Todos lanzan HttpError 422 con el campo afectado.
import { HttpError } from './http.js';

const fail = (field, msg) => { throw new HttpError(422, msg, { field }); };
const empty = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

export const V = {
  fail,
  str(o, k, label, { max = 200, required = false } = {}) {
    const v = o?.[k];
    if (empty(v)) { if (required) fail(k, `${label} es obligatorio`); return null; }
    if (typeof v !== 'string') fail(k, `${label} no es válido`);
    const s = v.trim();
    if (s.length > max) fail(k, `${label} no puede superar ${max} caracteres`);
    return s;
  },
  int(o, k, label, { min = 0, max = 1_000_000_000, def = null, required = false } = {}) {
    const v = o?.[k];
    if (empty(v)) { if (required) fail(k, `${label} es obligatorio`); return def; }
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) fail(k, `${label} debe ser un entero entre ${min} y ${max}`);
    return n;
  },
  num(o, k, label, { min = 0, max = 1e12 } = {}) {
    const v = o?.[k];
    if (empty(v)) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) fail(k, `${label} no es válido`);
    return n;
  },
  date(o, k, label) {
    const s = V.str(o, k, label, { max: 10 });
    if (s === null) return null;
    const d = new Date(`${s}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
      fail(k, `${label} debe tener formato AAAA-MM-DD`);
    }
    return s;
  },
  oneOf(o, k, label, list, def = null) {
    const v = o?.[k];
    if (empty(v)) { if (def === null) fail(k, `${label} es obligatorio`); return def; }
    if (!list.includes(v)) fail(k, `${label} no es válido`);
    return v;
  },
  color(o, k, def = '#5b8cff') {
    const v = o?.[k];
    if (empty(v)) return def;
    if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) fail(k, 'El color debe tener formato #RRGGBB');
    return v.toLowerCase();
  },
  strList(o, k, label, { max = 150, maxItems = 40 } = {}) {
    const v = o?.[k];
    if (empty(v)) return [];
    if (!Array.isArray(v) || v.length > maxItems) fail(k, `${label} no es válido (máximo ${maxItems})`);
    return v.map((x) => (typeof x === 'string' ? x.trim() : fail(k, `${label} no es válido`)))
      .filter(Boolean)
      .map((x) => (x.length > max ? fail(k, `Cada elemento de ${label} admite hasta ${max} caracteres`) : x));
  },
};
