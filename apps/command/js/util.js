// Small DOM + formatting helpers shared by every page. Same builder as ModelLens Web (web/js/util.js), plus a few IRIS helpers.
// Rule: text goes through textContent (the builder appends strings as text nodes); innerHTML is only ever fed static icon markup.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** hyperscript-style element builder: h('div.card', {class:'x', onclick, dataset:{}, attrs}, ...children) */
export function h(tag, attrs, ...children) {
  if (attrs && (attrs instanceof Node || typeof attrs !== 'object' || Array.isArray(attrs))) { children.unshift(attrs); attrs = null; }
  const m = tag.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
  const name = (m && m[1]) || 'div';
  const isSvg = ['svg', 'path', 'circle', 'g', 'text', 'rect', 'line', 'defs', 'linearGradient', 'stop', 'use', 'polyline', 'polygon', 'tspan', 'title'].includes(name);
  const el = isSvg ? document.createElementNS('http://www.w3.org/2000/svg', name) : document.createElement(name);
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g) || []) {
      if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1);
    }
  }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') { String(v).split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c)); }
      else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sv == null) continue; if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v; // static icon markup only — never user or server text
      else if (k === 'text') el.textContent = v;
      else if (k === 'href') { const safe = safeHref(v); if (safe) el.setAttribute('href', safe); }
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const frag = (...children) => append(document.createDocumentFragment(), children);
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

/** Only http(s) URLs and in-app hash routes are allowed as link targets; everything else is dropped. */
export function safeHref(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (s.startsWith('#')) return s;
  try { const u = new URL(s, location.origin); if (u.protocol === 'http:' || u.protocol === 'https:') return u.href; } catch { /* invalid */ }
  return null;
}
/** External anchor with rel="noopener noreferrer" and target=_blank; returns a span when the URL is not http(s). */
export function extLink(url, ...children) {
  const href = safeHref(url);
  if (!href || href.startsWith('#')) return h('span', ...children);
  return h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, ...children);
}

export const fmt = {
  int(n) { n = Number(n); return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'; },
  num(n, d = 1) { n = Number(n); return Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—'; },
  pct(n, d = 1) { n = Number(n); return Number.isFinite(n) ? `${n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}%` : '—'; },
  money(n, d = 2) { n = Number(n); if (!Number.isFinite(n)) return '—'; const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); return (n < 0 ? '−$' : '$') + s; },
  usd(n) { n = Number(n); if (!Number.isFinite(n)) return '—'; return fmt.money(n, Math.abs(n) >= 1000 ? 0 : 2); },
  compact(n) {
    n = Number(n); if (!Number.isFinite(n)) return '—';
    const abs = Math.abs(n);
    const u = abs >= 1e12 ? ['T', 1e12] : abs >= 1e9 ? ['B', 1e9] : abs >= 1e6 ? ['M', 1e6] : abs >= 1e3 ? ['k', 1e3] : null;
    if (!u) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    const v = n / u[1];
    const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
    return `${v.toFixed(digits)}${u[0]}`;
  },
  ms(ms) { ms = Number(ms); return !Number.isFinite(ms) ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`; },
  signed(n, d = 1) { n = Number(n); return !Number.isFinite(n) ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(d); },
  date(iso) { if (!iso) return '—'; try { return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return String(iso || ''); } },
  day(iso) { if (!iso) return '—'; try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return String(iso); } },
  time(iso) { if (!iso) return '—'; try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); } catch { return String(iso); } },
  timeS(iso) { if (!iso) return '—'; try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return String(iso); } },
  /** relative age from seconds: 42s · 12m · 3h · 2d */
  age(s) { s = Number(s); if (!Number.isFinite(s)) return '—'; if (s < 60) return `${Math.round(s)}s`; if (s < 3600) return `${Math.round(s / 60)}m`; if (s < 86400) return `${Math.round(s / 3600)}h`; return `${Math.round(s / 86400)}d`; },
  ago(iso) { if (!iso) return '—'; const s = (Date.now() - new Date(iso).getTime()) / 1000; return s < 0 ? 'now' : fmt.age(s) + ' ago'; },
  dur(s) { s = Number(s); if (!Number.isFinite(s)) return '—'; if (s < 60) return `${Math.round(s)}s`; const m = Math.floor(s / 60); const r = Math.round(s % 60); return m < 60 ? `${m}m ${String(r).padStart(2, '0')}s` : `${Math.floor(m / 60)}h ${m % 60}m`; },
};

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const truncate = (s, n) => { s = String(s ?? ''); return s.length <= n ? s : s.slice(0, Math.max(0, n - 1)) + '…'; };
export const debounce = (fn, ms = 120) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const uid = () => Math.random().toString(36).slice(2, 9);
export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const modKey = isMac ? '⌘' : 'Ctrl';
export const isTouch = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

/** Animated count-up. `render(v)` receives the interpolated value. */
export function countUp(el, to, { from = 0, duration = 900, render } = {}) {
  to = Number(to) || 0;
  const draw = render || ((v) => { el.textContent = fmt.int(Math.round(v)); });
  if (reducedMotion() || duration <= 0) { draw(to); return; }
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  function step(now) {
    const p = clamp((now - start) / duration, 0, 1);
    draw(from + (to - from) * ease(p));
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/** Text with the query highlighted via <mark> elements — built from DOM nodes, never innerHTML. */
export function highlight(text, q) {
  text = String(text ?? '');
  if (!q) return document.createTextNode(text);
  const i = text.toLowerCase().indexOf(String(q).toLowerCase());
  if (i < 0) return document.createTextNode(text);
  return frag(text.slice(0, i), h('mark', text.slice(i, i + q.length)), text.slice(i + q.length));
}

export function stableSort(arr, cmp) { return arr.map((v, i) => [v, i]).sort((a, b) => cmp(a[0], b[0]) || a[1] - b[1]).map((x) => x[0]); }
export const initials = (s) => String(s || '').split(/[\s@._-]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'IR';
export const SEV_RANK = { high: 0, medium: 1, low: 2, info: 3 };
export const sevClass = (s) => ({ high: 'sev-HIGH', critical: 'sev-CRITICAL', medium: 'sev-MEDIUM', low: 'sev-LOW', info: 'sev-INFO' }[String(s || 'info').toLowerCase()] || 'sev-INFO');
export const stripeClass = (s) => ({ high: 'stripe-HIGH', critical: 'stripe-CRITICAL', medium: 'stripe-MEDIUM', low: 'stripe-LOW', info: 'stripe-INFO' }[String(s || '').toLowerCase()] || '');
export const ratingFor = (score) => score >= 90 ? 'Strong' : score >= 80 ? 'Good' : score >= 70 ? 'Fair' : score >= 60 ? 'Needs Review' : 'High Review Priority';
export const scoreTone = (score) => score >= 80 ? 'good' : score >= 60 ? 'warn' : 'bad';
export const asArray = (v) => Array.isArray(v) ? v : v == null ? [] : [v];
export const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
