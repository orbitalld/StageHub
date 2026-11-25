// Gráficos SVG propios (sin librerías externas: el sistema debe funcionar sin internet).
const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const k of kids) if (k != null) el.append(typeof k === 'string' ? document.createTextNode(k) : k);
  return el;
};

/** Anillo de distribución. data: [{label, value, color}] */
export function donut(data, { size = 170, thickness = 26, centerLabel = '' } = {}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const r = (size - thickness) / 2, c = size / 2, circ = 2 * Math.PI * r;
  const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': 'Distribución del inventario por categoría' });
  svg.append(s('circle', { cx: c, cy: c, r, fill: 'none', stroke: '#1b2029', 'stroke-width': thickness }));
  let offset = 0;
  if (total > 0) {
    for (const d of data.filter((x) => x.value > 0)) {
      const len = (d.value / total) * circ;
      svg.append(s('circle', { cx: c, cy: c, r, fill: 'none', stroke: d.color, 'stroke-width': thickness,
        'stroke-dasharray': `${len} ${circ - len}`, 'stroke-dashoffset': -offset, transform: `rotate(-90 ${c} ${c})` }, s('title', {}, `${d.label}: ${d.value}`)));
      offset += len;
    }
  }
  svg.append(s('text', { x: c, y: c - 2, 'text-anchor': 'middle', style: 'font-size:22px;font-weight:650;fill:#e7e9ee' }, String(total)));
  svg.append(s('text', { x: c, y: c + 16, 'text-anchor': 'middle' }, centerLabel));
  return svg;
}

/** Barras horizontales (disponible sobre total por categoría). */
export function hbars(data, { width = 380, rowH = 30 } = {}) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const labelW = 118, pad = 44, h = Math.max(rowH, data.length * rowH);
  const svg = s('svg', { viewBox: `0 0 ${width} ${h}`, width: '100%', role: 'img', 'aria-label': 'Disponibles frente al total por categoría' });
  data.forEach((d, i) => {
    const y = i * rowH, bw = width - labelW - pad;
    svg.append(s('text', { x: 0, y: y + 18 }, d.label.length > 18 ? d.label.slice(0, 17) + '…' : d.label));
    svg.append(s('rect', { x: labelW, y: y + 7, width: (d.total / max) * bw, height: 14, rx: 4, fill: '#222a37' }, s('title', {}, `Total: ${d.total}`)));
    svg.append(s('rect', { x: labelW, y: y + 7, width: (d.available / max) * bw, height: 14, rx: 4, fill: d.color }, s('title', {}, `Disponibles: ${d.available}`)));
    svg.append(s('text', { x: labelW + (d.total / max) * bw + 6, y: y + 18 }, `${d.available}/${d.total}`));
  });
  return svg;
}

/** Línea de evolución. points: [{label, value}] */
export function line(points, { width = 380, height = 190, color = '#5b8cff' } = {}) {
  const svg = s('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', role: 'img', 'aria-label': 'Evolución del inventario' });
  if (points.length < 2) {
    svg.append(s('text', { x: width / 2, y: height / 2, 'text-anchor': 'middle' }, points.length ? `Hoy: ${points[0].value} equipos. La curva aparece desde el 2.º día.` : 'Sin datos aún'));
    return svg;
  }
  const L = 40, R = 12, T = 12, B = 26;
  const max = Math.max(1, ...points.map((p) => p.value)), min = Math.min(...points.map((p) => p.value));
  const lo = Math.max(0, min - (max - min) * 0.2), hi = max + (max - min) * 0.1 || max + 1;
  const x = (i) => L + (i / (points.length - 1)) * (width - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (height - T - B);
  for (let g = 0; g <= 3; g++) {
    const v = lo + ((hi - lo) * g) / 3, yy = y(v);
    svg.append(s('line', { x1: L, x2: width - R, y1: yy, y2: yy, stroke: '#1d232d' }));
    svg.append(s('text', { x: L - 6, y: yy + 4, 'text-anchor': 'end' }, String(Math.round(v))));
  }
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  svg.append(s('path', { d: `${d} L${x(points.length - 1)},${height - B} L${x(0)},${height - B} Z`, fill: color, opacity: '.12' }));
  svg.append(s('path', { d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  points.forEach((p, i) => svg.append(s('circle', { cx: x(i), cy: y(p.value), r: 3, fill: color }, s('title', {}, `${p.label}: ${p.value}`))));
  svg.append(s('text', { x: L, y: height - 8 }, points[0].label));
  svg.append(s('text', { x: width - R, y: height - 8, 'text-anchor': 'end' }, points.at(-1).label));
  return svg;
}
