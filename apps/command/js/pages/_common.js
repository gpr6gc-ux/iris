// Shared page helpers: async section loader with skeleton/empty/error states, KPI tiles, common pills.

import { h, clear, fmt, extLink } from '../util.js';
import { iconEl } from '../icons.js';
import { call } from '../api.js';
import { skeleton, errorState, pill } from '../ui.js';

/**
 * Load `fn(args)` into `host`: shows the skeleton, then calls draw(data, host, reload) or the error state with retry.
 * Returns a promise of the data (or undefined on error).
 */
export async function load(host, fn, args, draw, { skel = null, onError = null } = {}) {
  const run = async () => {
    // Route-scoped guard (A11): if the host was detached (user navigated away / page torn down),
    // never apply a late response, error, or subscription onto a dead node.
    if (!host.isConnected) return undefined;
    clear(host);
    host.append(skel || defaultSkeleton());
    host.setAttribute('aria-busy', 'true');
    try {
      const data = await call(fn, args);
      if (!host.isConnected) return data;         // navigated away during the request
      clear(host); host.removeAttribute('aria-busy');
      await draw(data, host, run);
      return data;
    } catch (e) {
      if (!host.isConnected) return undefined;    // don't render an error into a detached page
      clear(host); host.removeAttribute('aria-busy');
      host.append(errorState(e, run));
      onError && onError(e);
      return undefined;
    }
  };
  return run();
}

export function defaultSkeleton() {
  return h('div.loading-state', { 'aria-hidden': 'true' }, h('div.kpis', skeleton('h-80'), skeleton('h-80'), skeleton('h-80'), skeleton('h-80')), h('div.row', h('div.f16', skeleton('h-380')), h('div.f1', skeleton('h-380'))));
}
export const skelRows = (n = 4, hgt = 'h-40') => h('div.stack.tight', { 'aria-hidden': 'true' }, Array.from({ length: n }, () => skeleton(hgt)));

export function kpi(icon, label, value, sub, tone = '') {
  return h('div.kpi', h('div.k', iconEl(icon), h('span', label)), h('div.v.ml-pop', { class: tone ? `tone-${tone}` : '' }, value), sub ? h('div.s', sub) : null);
}
export function card(title, hint, body, { glow = false, flush = false, cls = '' } = {}) {
  const el = h('div.card', { class: `${glow ? 'glow' : ''} ${flush ? 'flush' : ''} ${cls}` });
  if (title != null) el.append(h('div.card-head', typeof title === 'string' ? h('h2', title) : title, hint ? h('div.hint', typeof hint === 'string' ? h('span.hint-text', hint) : hint) : null));
  if (body) el.append(...(Array.isArray(body) ? body : [body]).filter(Boolean));
  return el;
}
export const agentPill = (name) => pill(name, 'status neutral nodot');
export const kindPill = (kind) => pill(kind, `kind kind-${kind}`);
export const money = (n) => fmt.money(n);
export const riskPill = (risk) => { const r = String(risk || 'low').toLowerCase(); return pill(`${r} risk`, `status ${r === 'high' ? 'bad' : r === 'medium' ? 'warn' : 'info'}`); };
export const statePill = (state) => {
  const s = String(state || '').toLowerCase();
  const tone = /live|ok|running|done|active|fixed|green|clears|approved|published|accepted/.test(s) ? 'good' : /stale|hold|held|warn|pending|near|open|owner|reviewing|scored|revise/.test(s) ? 'warn' : /fail|error|rejected|declined|dismissed|dead|red|revoked/.test(s) ? 'bad' : 'neutral';
  return pill(state, `status ${tone}`);
};
export function srcLink(uri, title) {
  const isHttp = /^https?:\/\//i.test(String(uri || ''));
  const label = title || uri;
  return isHttp ? extLink(uri, iconEl('external', 'ic-14'), h('span.txt', label)) : h('span.src', iconEl('db', 'ic-14'), h('span.txt', label));
}
export const dash = (v) => (v == null || v === '' ? '—' : v);
