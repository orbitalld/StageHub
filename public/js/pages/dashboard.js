import { companyName } from '../state.js';
import { get } from '../api.js';
import { h, icon, badge, fmtNum, fmtDateTime } from '../ui.js';
import { donut, hbars, line } from '../charts.js';

export default async function dashboardPage(el) {
  const d = await get('/api/dashboard');
  const t = d.totals;
  const kpi = (label, value, cls = '') => h('div', { class: `kpi ${cls}` }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, fmtNum(value)));

  const cats = d.by_category.filter((c) => c.total > 0);
  const empty = t.total === 0;

  el.append(
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Panel de control'), h('div', { class: 'sub' }, `Estado actual del inventario · ${companyName()}`)), h('div', { class: 'spacer' }),
      h('a', { class: 'btn', href: '#/dashboard' }, icon('back'), 'Todas las empresas'), h('a', { class: 'btn', href: '#/inventory' }, icon('package'), 'Ver inventario')),
    h('div', { class: 'grid kpis' },
      kpi('Equipos registrados', t.total), kpi('Disponibles', t.available, 'ok'),
      kpi('En mantenimiento', t.maintenance, t.maintenance ? 'warn' : ''), kpi('Fuera de servicio', t.out_of_service, t.out_of_service ? 'bad' : ''),
      kpi('Referencias', t.references_count)),
    h('div', { style: { height: '14px' } }),
    empty ? h('div', { class: 'card empty' }, h('h2', {}, 'Aún no hay equipos registrados'),
      h('p', {}, 'Registra tu primer equipo para ver estadísticas aquí.'), h('a', { class: 'btn primary', href: '#/inventory' }, 'Ir a inventario')) :
      h('div', { class: 'grid cols-2' },
        h('div', { class: 'card' }, h('h2', {}, 'Distribución por categoría'),
          h('div', { class: 'chart-row' }, donut(cats.map((c) => ({ label: c.name, value: c.total, color: c.color })), { centerLabel: 'equipos' }),
            h('div', { class: 'legend' }, cats.map((c) => h('div', {}, h('span', { class: 'dot', style: { background: c.color } }), c.name, h('b', {}, fmtNum(c.total)))))),
        ),
        h('div', { class: 'card' }, h('h2', {}, 'Disponibles por categoría'), hbars(cats.map((c) => ({ label: c.name, total: c.total, available: c.available, color: c.color })))),
      ),
    h('div', { style: { height: '14px' } }),
    h('div', { class: 'grid cols-2' },
      h('div', { class: 'card' }, h('h2', {}, 'Evolución del inventario'),
        line(d.evolution.map((e) => ({ label: e.day.split('-').reverse().join('-'), value: e.total }))),
        h('div', { class: 'muted small', style: { marginTop: '6px' } }, 'Total de equipos registrado cada día.')),
      h('div', { class: 'card' }, h('h2', {}, h('span', { class: 'row' }, icon('alert'), 'Stock insuficiente')),
        d.low_stock.length ? h('ul', { class: 'list' }, d.low_stock.map((i) => h('li', {},
          h('a', { href: `#/inventory/${i.id}`, style: { flex: 1 } }, i.name, h('div', { class: 'muted small mono' }, i.internal_code)),
          badge(`${i.available} de ${i.min_stock} mín.`, 'bad')))) :
          h('p', { class: 'muted', style: { margin: 0 } }, 'Ningún equipo está por debajo de su stock mínimo. Define el mínimo en la ficha de cada equipo.'))),
    h('div', { style: { height: '14px' } }),
    h('div', { class: 'card' }, h('h2', {}, 'Actividad reciente'),
      d.recent.length ? h('ul', { class: 'list' }, d.recent.map((r) => h('li', {}, h('span', { style: { flex: 1 } }, r.summary),
        h('span', { class: 'muted small' }, `${r.username ?? '—'} · ${fmtDateTime(r.ts)}`)))) : h('p', { class: 'muted', style: { margin: 0 } }, 'Sin actividad registrada.')),
  );
}
