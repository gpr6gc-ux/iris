// Application state: preferences (theme/mode/density), session + owner status, preview flag, cached mission KPIs, event bus.

const PREF_KEY = 'iris.prefs';
const PREVIEW_KEY = 'iris.preview';
const DEFAULT_PREFS = { theme: 'lens', mode: 'dark', density: 'comfortable', sidebar: 'auto', streamAgent: '' };

export const S = {
  prefs: loadPrefs(),
  preview: loadPreview(),          // true → fixtures, no RPC calls, banner, Money hidden
  session: null,                   // supabase session (live mode)
  user: null,                      // { email, id }
  owner: null,                     // null unknown · true owner · false forbidden
  me: null,                        // iris2_me payload: {role:'owner'|'member'|'none', email, scopes[]} — members see only their scope's pages
  config: null,                    // iris2_config_public payload
  backendError: null,              // {code, message} when config_public failed for a non-auth reason
  kpis: null,                      // cached iris2_mission kpis for the topbar chips + sidebar badges
  counts: {},                      // sidebar badges: decisions, revenue, agents, projects
  realtime: { state: 'idle', mode: 'off', last_at: null },  // state: idle|connecting|live|polling|error
  version: '5.0.0',
};

function loadPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch { p = {}; }
  try {
    const t = localStorage.getItem('iris.theme'); const m = localStorage.getItem('iris.mode');
    if (t) p.theme = t; if (m) p.mode = m;
  } catch { /* storage unavailable */ }
  return { ...DEFAULT_PREFS, ...p };
}
export function setPref(k, v) {
  S.prefs[k] = v;
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(S.prefs));
    if (k === 'theme') localStorage.setItem('iris.theme', v);
    if (k === 'mode') localStorage.setItem('iris.mode', v);
  } catch { /* storage unavailable */ }
  emit('pref', { key: k, value: v });
}

function loadPreview() {
  try {
    const q = new URLSearchParams(location.search);
    if (q.has('preview')) { sessionStorage.setItem(PREVIEW_KEY, '1'); return true; }
    return sessionStorage.getItem(PREVIEW_KEY) === '1';
  } catch { return false; }
}
export function setPreview(on) {
  S.preview = !!on;
  try { if (on) sessionStorage.setItem(PREVIEW_KEY, '1'); else sessionStorage.removeItem(PREVIEW_KEY); } catch { /* ignore */ }
  emit('preview', S.preview);
}

const listeners = new Map();
export function on(evt, fn) { if (!listeners.has(evt)) listeners.set(evt, new Set()); listeners.get(evt).add(fn); return () => listeners.get(evt).delete(fn); }
export function emit(evt, data) { (listeners.get(evt) || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); }

export function setKpis(kpis) {
  S.kpis = kpis || null;
  if (kpis) {
    S.counts.decisions = kpis.needs_you?.total ?? S.counts.decisions;
    S.counts.revenue = kpis.needs_you?.content ?? S.counts.revenue;
  }
  emit('kpis', S.kpis);
}
export function setCount(key, n) { S.counts[key] = n; emit('counts', S.counts); }
export function setRealtime(patch) { Object.assign(S.realtime, patch); emit('realtime', S.realtime); }
