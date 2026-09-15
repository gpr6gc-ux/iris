// Hand-drawn SVG charts (no library): ring gauge (ModelLens), sparkline with area fill, mini bars, hourly columns.
// Colours come from CSS variables so every chart is correct in light and dark, in all six hues.

import { fmt, reducedMotion } from './util.js';

const NS = 'http://www.w3.org/2000/svg';
export const svgEl = (tag, attrs = {}, ...children) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null) continue; el.setAttribute(k, v); }
  for (const c of children.flat()) if (c != null) el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
};

/** Score ring. tone: good|warn|bad. The arc animates from 0 on mount. */
export function ringGauge(value, { size = 132, stroke = 10, tone = '', unit = 'of 100', label } = {}) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Number(value) || 0)) / 100;
  const svg = svgEl('svg', { class: 'ring', width: size, height: size, viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': label || `Score ${fmt.num(value, 1)} ${unit}`, style: `width:${size}px;height:${size}px` });
  svg.appendChild(svgEl('circle', { class: 'track', cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke }));
  const arc = svgEl('circle', { class: `arc ${tone}`, cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke, 'stroke-linecap': 'round', 'stroke-dasharray': c, 'stroke-dashoffset': c, transform: `rotate(-90 ${size / 2} ${size / 2})` });
  svg.appendChild(arc);
  svg.appendChild(svgEl('text', { class: 'ring-v', x: size / 2, y: size / 2 - 3, 'text-anchor': 'middle' }, fmt.num(value, 1)));
  svg.appendChild(svgEl('text', { class: 'ring-l', x: size / 2, y: size / 2 + 16, 'text-anchor': 'middle' }, unit.toUpperCase()));
  const target = c * (1 - pct);
  if (reducedMotion()) arc.setAttribute('stroke-dashoffset', target);
  else requestAnimationFrame(() => requestAnimationFrame(() => arc.setAttribute('stroke-dashoffset', target)));
  return svg;
}

/** Sparkline: polyline + soft area + end dot. color: CSS colour (default primary). */
export function sparkline(points, { w = 120, h = 32, color = 'var(--primary)', fill = true, label } = {}) {
  const pts = (points || []).map(Number).filter(Number.isFinite);
  const svg = svgEl('svg', { class: 'sparkline', viewBox: `0 0 ${w} ${h}`, width: w, height: h, role: label ? 'img' : 'presentation', 'aria-label': label || null, 'aria-hidden': label ? null : 'true', preserveAspectRatio: 'none' });
  if (pts.length < 2) { svg.appendChild(svgEl('line', { x1: 2, y1: h / 2, x2: w - 2, y2: h / 2, stroke: 'var(--border-strong)', 'stroke-width': 1, 'stroke-dasharray': '3 3' })); return svg; }
  const mn = Math.min(...pts); const mx = Math.max(...pts); const rng = (mx - mn) || 1;
  const step = (w - 6) / (pts.length - 1);
  const xy = pts.map((v, i) => [3 + i * step, h - 3 - (v - mn) / rng * (h - 8)]);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  if (fill) svg.appendChild(svgEl('path', { d: `M${xy[0][0].toFixed(1)},${h} L${line.replace(/ /g, ' L')} L${xy[xy.length - 1][0].toFixed(1)},${h} Z`, fill: color, opacity: '.12' }));
  svg.appendChild(svgEl('polyline', { points: line, fill: 'none', stroke: color, 'stroke-width': 1.75, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }));
  const [lx, ly] = xy[xy.length - 1];
  svg.appendChild(svgEl('circle', { cx: lx.toFixed(1), cy: ly.toFixed(1), r: 2.5, fill: color }));
  return svg;
}

/** Column chart for 24 hourly values (or any short series). */
export function columns(values, { w = 420, h = 44, color = 'var(--primary)', label } = {}) {
  const vals = (values || []).map((v) => Number(v) || 0);
  const svg = svgEl('svg', { class: 'columns', viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': label || `${vals.length} values`, preserveAspectRatio: 'none' });
  if (!vals.length) return svg;
  const mx = Math.max(...vals, 0.0001); const gap = 2; const bw = (w - gap * (vals.length - 1)) / vals.length;
  vals.forEach((v, i) => {
    const bh = Math.max(1.5, (v / mx) * (h - 2));
    svg.appendChild(svgEl('rect', { x: (i * (bw + gap)).toFixed(1), y: (h - bh).toFixed(1), width: bw.toFixed(1), height: bh.toFixed(1), rx: 1.5, fill: color, opacity: i === vals.length - 1 ? 1 : 0.55 }));
  });
  return svg;
}
