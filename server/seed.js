// Catálogo inicial. Se carga UNA sola vez en una base nueva; después todo se edita desde la aplicación.
import { tx } from './db.js';

const I = (name, spec = []) => ({ name, mode: 'individual', spec });
const C = (name, spec = []) => ({ name, mode: 'cantidad', spec });

export const DEFAULT_CATALOG = [
  { name: 'Iluminación', color: '#f5b73b', mode: 'individual', subs: [
    I('Beam'), I('Spot'), I('Wash'), I('Hybrid'), I('Blinder'), I('Strobe'), I('COB'), I('PAR LED'),
    I('Barras LED'), I('Láser'), I('Consolas de iluminación'), I('Nodos DMX'), I('Splitters DMX'),
    C('Accesorios de iluminación')] },
  { name: 'Pantallas LED y Video', color: '#7c6cf0', mode: 'individual', subs: [
    C('Paneles LED', ['Pixel pitch (mm)', 'Ancho (mm)', 'Alto (mm)']), I('Procesadores LED'), C('Sending cards'),
    C('Receiving cards'), I('Video controllers'), I('Monitores'), I('Proyectores'), I('Cámaras'),
    I('Matrices de video'), C('Conversores HDMI/SDI'), I('Capturadoras'), I('Computadores'), C('Accesorios de video')] },
  { name: 'Audio', color: '#34c0a0', mode: 'individual', subs: [
    I('Parlantes activos'), I('Parlantes pasivos'), I('Subwoofers'), I('Line Array'), I('Amplificadores'),
    I('Consolas digitales'), I('Consolas analógicas'), I('Micrófonos'), I('Sistemas inalámbricos'),
    C('Antenas RF'), I('Procesadores'), I('Monitores de escenario'), C('Cableado de audio'), C('Accesorios')] },
  { name: 'Estructuras y Truss', color: '#ef7d57', mode: 'cantidad', subs: [
    C('Truss cuadrado', ['Largo (m)']), C('Truss triangular', ['Largo (m)']), C('Truss circular', ['Diámetro (m)']),
    C('Torres'), C('Bases'), I('Motores'), I('Polipastos'), C('Eslingas'), C('Grilletes'), C('Abrazaderas'),
    C('Accesorios de rigging')] },
  { name: 'Escenario', color: '#4ea1ff', mode: 'cantidad', subs: [
    C('Tarimas', ['Ancho (m)', 'Largo (m)', 'Alto (m)']), C('Plataformas', ['Ancho (m)', 'Largo (m)', 'Alto (m)']),
    C('Escaleras'), C('Barandas'), C('Techos'), C('Estructuras de escenario'), C('Accesorios'),
    C('Corrales', ['Largo (m)', 'Alto (m)']), C('Patas', ['Alto (m)']), C('Bases de patas')] },
  { name: 'Electricidad', color: '#e5534b', mode: 'cantidad', subs: [
    I('Tableros eléctricos'), I('Distribuidores'), I('Generadores'), C('Extensiones', ['Largo (m)']),
    C('Cables de alimentación', ['Largo (m)']), C('Conectores'), C('Adaptadores'), C('Protecciones eléctricas')] },
  { name: 'Cableado y Accesorios', color: '#9aa4b2', mode: 'cantidad', subs: [
    'DMX', 'XLR', 'PowerCON', 'True1', 'Ethernet', 'Cat5/Cat6', 'HDMI', 'SDI', 'Schuko', 'Adaptadores', 'Otros',
  ].map((n) => C(n, ['Largo (m)'])) },
];

export async function seedCatalog(db) {
  const done = (await db.prepare(`SELECT value FROM settings WHERE key = 'catalog_seeded'`).get());
  if (done) return false;
  (await tx(db, async () => {
    const insCat = db.prepare('INSERT INTO categories(name, color, tracking_mode, sort_order) VALUES (?,?,?,?)');
    const insSub = db.prepare('INSERT INTO subcategories(category_id, name, tracking_mode, spec_template, sort_order) VALUES (?,?,?,?,?)');
    for (const [i, c] of DEFAULT_CATALOG.entries()) {
      const id = Number((await insCat.run(c.name, c.color, c.mode, i)).lastInsertRowid);
      for (const [j, s] of c.subs.entries()) (await insSub.run(id, s.name, s.mode, JSON.stringify(s.spec), j));
    }
    (await db.prepare(`INSERT INTO settings(key, value) VALUES ('catalog_seeded', '1')`).run());
  }));
  return true;
}
