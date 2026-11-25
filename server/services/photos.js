// Fotografías de equipos: se validan por contenido real (no por extensión) y se guardan en data/uploads.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { HttpError } from '../http.js';
import { putPhoto, deletePhoto } from '../storage.js';

export const PHOTO_RE = /^[a-f0-9]{32}\.(jpg|png|webp)$/;
export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

function detectExt(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}

export async function savePhoto(cfg, buf) {
  const ext = detectExt(buf);
  if (!ext) throw new HttpError(415, 'El archivo no es una imagen válida (se admite JPG, PNG o WebP)');
  fs.mkdirSync(cfg.uploadsDir, { recursive: true });
  const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  if (cfg.databaseUrl) await putPhoto(cfg,name,buf);
  else fs.writeFileSync(path.join(cfg.uploadsDir, name), buf);
  return name;
}

export function copyPhoto(cfg, name) {
  if (!name || !PHOTO_RE.test(name)) return null;
  if (cfg.databaseUrl) return name; // Referencia compartida: no duplicar bytes; se borra solo sin referencias.
  const copy = `${crypto.randomBytes(16).toString('hex')}.${name.split('.')[1]}`;
  try { fs.copyFileSync(path.join(cfg.uploadsDir, name), path.join(cfg.uploadsDir, copy)); } catch { return null; }
  return copy;
}

/** Borra el archivo si ningún equipo lo usa. */
export async function releasePhoto({ db, cfg }, name) {
  if (!name || !PHOTO_RE.test(name)) return;
  if ((await db.prepare('SELECT 1 FROM items WHERE photo = ?').get(name))) return;
  try { if(cfg.databaseUrl) await deletePhoto(cfg,name); else fs.unlinkSync(path.join(cfg.uploadsDir,name)); } catch(e){ if(cfg.databaseUrl) console.error('[storage] limpieza:',e.message); }
}
