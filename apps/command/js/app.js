// IRIS Command 5.0 — application shell: auth gate, routing, sidebar, topbar chips, ⌘K palette, ⌘J Tell IRIS, shortcuts, phone tabs.

import { h, $, $$, clear, fmt, debounce, modKey, initials, highlight, safeHref } from './util.js';
import { icon, iconEl, irisGlyphEl } from './icons.js';
import { S, on, emit, setPref, setPreview, setKpis, setCount } from './store.js';
import { parseHash, onRoute, navigate, href } from './router.js';
import { toast, openPopover, closePopover, openDialog, openSheet, closeTop, hasOpenLayer, isPopoverOpen, confirmDialog, skeleton, closePanel, closeSheet, isSheetOpen } from './ui.js';
import { applyTheme, applyDensity, THEMES, MODES } from './theme.js';
import { CONFIG } from './config.js';
import { call } from './api.js';
import { initSession, signOut, urlHasAuthCallback, getClient } from './auth.js';
import { reconnectStream } from './realtime.js';
import * as signin from './pages/signin.js';
import * as cortex from './pages/cortex.js';
import * as traces from './pages/traces.js';
import * as today from './pages/today.js';
import * as mission from './pages/mission.js';
import * as decisions from './pages/decisions.js';
import * as agents from './pages/agents.js';
import * as revenue from './pages/revenue.js';
import * as commerce from './pages/commerce.js';
import * as projects from './pages/projects.js';
import * as modellens from './pages/modellens.js';
import * as karta from './pages/karta.js';
import * as estate from './pages/estate.js';
import * as leads from './pages/leads.js';
import * as studio from './pages/studio.js';
import * as careers from './pages/careers.js';
import * as markets from './pages/markets.js';
import * as brain from './pages/brain.js';
import * as intel from './pages/intel.js';
import * as money from './pages/money.js';
import * as autonomy from './pages/autonomy.js';
import * as evolution from './pages/evolution.js';
import * as governance from './pages/governance.js';
import * as keys from './pages/keys.js';
import * as settings from './pages/settings.js';
import * as station from './pages/station.js';

export const PAGES = {
  cortex: { title: 'Cortex', icon: 'graph', key: 'x', group: 'Command', mod: cortex, sub: () => 'the living map — every agent · every signal · in real time' },
  station: { title: 'Station', icon: 'terminal', key: 'h', group: 'Command', mod: station, sub: () => 'your PC as IRIS’s hands — heartbeat · direct link · E-STOP' },
  traces: { title: 'Traces', icon: 'route', key: 'z', group: 'Command', mod: traces, sub: () => 'what happened, in causal order — every run, its cost and the approval it waited on' },
  today: { title: 'Today', icon: 'activity', key: 't', group: 'Command', mod: today, sub: () => 'the glanceable view — what needs you, one tap to act', count: () => S.counts.needsYou },
  mission: { title: 'Mission', icon: 'mission', key: 'm', group: 'Command', mod: mission, sub: () => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }) + ' · ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) },
  decisions: { title: 'Approvals', icon: 'inbox', key: 'd', group: 'Approvals', mod: decisions, sub: () => 'one queue for proposals, content, claims and builds', count: () => S.counts.decisions, hot: true },
  agents: { title: 'Agents', icon: 'agents', key: 'a', group: 'Agents', mod: agents, sub: () => S.counts.agentsSub || 'constellation · roster · live thinking', count: () => S.counts.agents },
  revenue: { title: 'Revenue', icon: 'revenue', key: 'r', group: 'Ventures', mod: revenue, sub: () => S.counts.revenueSub || 'content lanes · every channel switch is OFF until you flip it', count: () => S.counts.revenue },
  commerce: { title: 'Commerce', icon: 'dollar', key: 'o', group: 'Ventures', mod: commerce, sub: () => 'orders · payments · fulfillment · entitlements — the real-money lifecycle', count: () => S.counts.commerce },
  estate: { title: 'Estate', icon: 'estate', key: 'e', group: 'Personal', mod: estate, sub: () => S.counts.estateSub || 'live for-sale inventory · underwritten for cashflow' },
  leads: { title: 'Leads', icon: 'send', key: 'l', group: 'Ventures', mod: leads, sub: () => 'prospects · drafted one-pagers + outreach · you review and send', count: () => S.counts.leadsReady },
  careers: { title: 'Careers', icon: 'compass', key: 'f', group: 'Personal', mod: careers, sub: () => 'job intake · JD → tailored resume + weighted fit score · your pipeline', count: () => S.counts.careersOpen },
  studio: { title: 'Studio', icon: 'play', key: 'c', group: 'Ventures', mod: studio, sub: () => 'AI video pipeline · script → voiceover + captions + cinematic → you approve', count: () => S.counts.studioReady },
  projects: { title: 'Projects', icon: 'projects', key: 'p', group: 'Ventures', mod: projects, sub: () => 'the library of published work · each opens as a full view', count: () => S.counts.projects, subpages: { modellens: { title: 'ModelLens', mod: modellens, sub: () => 'Projects › ModelLens · Anaplan model intelligence' }, karta: { title: 'Karta Memory', mod: karta, sub: () => 'Projects › Karta · governed project memory' } } },
  money: { title: 'Money', icon: 'money', key: 'n', group: 'Personal', mod: money, sub: () => (S.preview ? 'hidden in preview' : 'owner only · never in a public asset') },
  markets: { title: 'Investing', icon: 'markets', key: 'k', group: 'Personal', mod: markets, sub: () => 'decisions · market regime · options posture' },
  brain: { title: 'Brain', icon: 'brain', key: 'b', group: 'Knowledge', mod: brain, sub: () => 'claims · memory · goals' },
  intel: { title: 'Intel', icon: 'intel', key: 'i', group: 'Knowledge', mod: intel, sub: () => 'sources · finds · harvest' },
  autonomy: { title: 'Autonomy', icon: 'bolt', key: 'u', group: 'System', mod: autonomy, sub: () => 'kill switch · per-agent guardrails · schedules · spend ceilings' },
  evolution: { title: 'Evolution', icon: 'layers', key: 'g', group: 'System', mod: evolution, sub: () => 'versioned agent prompts · eval-gated promote · one-click rollback' },
  governance: { title: 'Governance', icon: 'governance', key: 'v', group: 'System', mod: governance, sub: () => 'spend · gates · tokens · audit · security' },
  keys: { title: 'Vault', icon: 'lock', key: 'y', group: 'System', mod: keys, sub: () => 'every key · live connection status', count: () => S.counts.keysMissing },
  settings: { title: 'Settings', icon: 'settings', key: 's', group: 'System', mod: settings, sub: () => 'appearance · density · session · about' },
};
const GROUPS = ['Command', 'Approvals', 'Ventures', 'Agents', 'Knowledge', 'Personal', 'System'];
const PHONE_TABS = ['today', 'decisions', 'agents', 'money'];
// Members (invited, scoped accounts) see only the pages their scope covers; the backend refuses everything else anyway.
const PAGE_SCOPE = { markets: 'investing' };
export const isMember = () => !!(S.me && S.me.role === 'member');
const pageAllowed = (key) => !isMember() || key === 'settings' || (PAGE_SCOPE[key] && (S.me.scopes || []).includes(PAGE_SCOPE[key]));
const visiblePages = () => Object.fromEntries(Object.entries(PAGES).filter(([k]) => pageAllowed(k)));
const homeRoute = () => (isMember() ? '#/markets' : '#/cortex');

let root; let appEl = null; let cleanup = null; let lastKey = null; let kpiTimer = null; let paletteOpen = false;

let authWired = false;
function wireAuthEvents() {
  if (authWired) return; authWired = true;
  on('auth', ({ event }) => {
    if (S.preview) return;
    if (event === 'SIGNED_OUT') { teardownApp(); mountSignIn(); }
    else if (event === 'SIGNED_IN' && !appEl && !document.querySelector('.auth-checking')) { enterAsOwner(); }
  });
  on('auth:forbidden', () => { if (isMember()) return; /* a member touched an owner function — the page shows its own error; no eviction */ if (!S.preview && S.owner !== false) { S.owner = false; S.ownerState = 'denied'; teardownApp(); mountNotOwner(); } });
}
wireAuthEvents();

async function enterAsOwner() {
  showChecking('Checking the allow-list…');
  S.ownerState = 'verifying'; S.me = null;
  // who is this? owner → the whole room; member → the pages their scope covers; nobody → the not-on-the-list screen
  try { S.me = await call('iris2_me', {}, { dedupe: false }); } catch (e) { S.me = null; }
  if (S.me && S.me.role === 'member') {
    S.owner = false; S.ownerState = 'member'; S.backendError = null; S.config = null;
    mountApp(); return;
  }
  if (S.me && S.me.role === 'none') { S.owner = false; S.ownerState = 'denied'; mountNotOwner(); return; }
  try {
    S.config = await call('iris2_config_public', {}, { dedupe: false });
    S.owner = true; S.ownerState = 'verified'; S.backendError = null;
  } catch (e) {
    if (e && e.code === 'forbidden') { S.owner = false; S.ownerState = 'denied'; mountNotOwner(); return; }
    // A09: backend unreachable ≠ verified owner. Enter READ-ONLY (unverified); live mutations stay gated
    // via canMutate() until a real iris2_config_public succeeds. Pages still show their own error states.
    S.owner = false; S.ownerState = 'unverified'; S.backendError = { code: e.code || 'error', message: e.message || String(e) };
    console.warn('config_public failed', e);
  }
  mountApp();
}

// A09: the single source of truth for whether a live, side-effectful action may be sent.
// Preview uses fixtures (no network), so it's allowed; live requires a verified owner check.
export const canMutate = () => S.preview || S.ownerState === 'verified';

function showChecking(label) {
  clear(root);
  root.append(h('div.auth-center.auth-checking', h('div.card.auth-card', { style: { alignItems: 'center', textAlign: 'center', gap: '14px' } }, irisGlyphEl(40), h('div.loading-hint', { style: { justifyContent: 'center' } }, h('span.live-dot.checking'), label), skeleton('h-16 w-70'), skeleton('h-16 w-50'))));
}
function showAuthUnavailable(e) {
  clear(root);
  root.append(h('div.auth-center', h('div.card.auth-card', h('div', h('h2', 'Sign-in is unavailable'), h('p.sub', 'The auth library did not load or Supabase could not be reached.')),
    h('div.status.bad', iconEl('alert'), h('span', String(e && e.message ? e.message : e))),
    h('div', { style: { display: 'flex', gap: '8px' } }, h('button.btn.btn-primary', { type: 'button', onclick: () => location.reload() }, iconEl('refresh'), 'Reload'), h('button.btn', { type: 'button', onclick: () => { setPreview(true); location.hash = '#/cortex'; location.reload(); } }, iconEl('eye'), 'Preview with sample data')))));
}
function mountSignIn() {
  if (root.querySelector('.auth[data-signin]')) return; // already showing the form — keep what the owner typed
  teardownApp(); clear(root); document.title = 'Sign in · IRIS Command';
  root.append(signin.render({ onPreview: () => { setPreview(true); history.replaceState(null, '', location.pathname + '#/cortex'); mountApp(); }, onSignedIn: () => enterAsOwner() }));
}
function mountNotOwner() {
  teardownApp(); clear(root); document.title = 'Not an owner · IRIS Command';
  const email = S.user?.email || 'this account';
  root.append(h('div.auth-center', h('div.card.auth-card', { style: { gap: '16px' } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } }, irisGlyphEl(40), h('div', h('h2', 'This account isn’t on the list'), h('p.sub', 'Signed in, but neither an owner nor an invited member.'))),
    h('div.status.bad', iconEl('lock'), h('span', h('b', email), ' is not an owner and has not been invited as a member, so every call is refused. If you were invited, sign in with the exact email the invitation was sent to; otherwise ask the owner to add you under Governance › Members.')),
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      h('button.btn.btn-primary', { type: 'button', onclick: () => enterAsOwner() }, iconEl('refresh'), 'Check again'),
      h('button.btn', { type: 'button', onclick: async () => { await signOut(); mountSignIn(); } }, iconEl('logout'), 'Sign out'),
      h('button.btn.btn-ghost', { type: 'button', onclick: () => { setPreview(true); history.replaceState(null, '', location.pathname + '#/cortex'); mountApp(); } }, iconEl('eye'), 'Preview with sample data')),
  )));
}

// ---------------------------------------------------------------- app shell
function mountApp() {
  clear(root); paletteOpen = false;
  if (S.preview && !S.me) S.me = /[?&]as=member/.test(location.search) ? { role: 'member', email: 'newguy@example.com', scopes: ['investing'] } : { role: 'owner', email: 'preview', scopes: ['*'] }; // ?preview&as=member shows the member view with sample data
  const brand = h('a.brand', { href: homeRoute(), 'aria-label': 'IRIS Command' }, h('span.brand-glyph', { 'aria-hidden': 'true' }, irisGlyphEl(30)), h('span.brand-text', h('span.brand-name', 'IRIS Command'), h('span.brand-by', '5.0 · operating system')));
  const sidebar = h('aside.sidebar#sidebar', { 'aria-label': 'Primary' },
    h('div.sidebar-brand', brand),
    h('div.sidebar-tell', h('button.btn#tell-btn', { type: 'button', title: `Tell IRIS (${modKey} J)`, onclick: () => openTell() }, iconEl('send'), h('span.nav-label', 'Tell IRIS'), h('kbd.kbd', `${modKey} J`))),
    h('nav.sidebar-nav#nav', { 'aria-label': 'Pages' }),
    h('div.sidebar-footer#sidebar-footer'));
  const topbar = h('header.topbar#topbar',
    h('div.topbar-left', h('div.topbar-title', h('h1#page-title', 'Mission'), h('span.topbar-sub#page-sub'))),
    h('div.topbar-right',
      h('button.chip.chip-spend#chip-spend', { type: 'button', title: 'Spend today vs the daily hard cap — open Governance', onclick: () => navigate('/governance') }, h('span.lbl', 'Spend today'), h('span.num', '—')),
      h('button.chip.chip-gates#chip-gates', { type: 'button', title: 'Memory-isolation probes passing (hourly Gatekeeper) — open Governance', onclick: () => navigate('/governance') }, h('span.lbl', 'Memory gates'), h('span.num', '—')),
      h('button.search-btn.ask-btn#search-btn', { type: 'button', 'aria-label': `Ask IRIS anything (${modKey} K)`, onclick: () => openPalette() }, iconEl('sparkles'), h('span.search-btn-text', 'Ask IRIS anything…'), h('kbd.kbd', `${modKey}K`)),
      h('button.avatar#avatar', { type: 'button', 'aria-label': 'Account menu', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', onclick: (e) => openAvatarMenu(e.currentTarget) }, S.preview ? iconEl('eye') : initials(S.user?.email || 'IR'))));
  const memberBanner = isMember() ? h('div.preview-banner#member-banner', { role: 'status' }, iconEl('markets'), h('span.grow', h('b', 'Member · ', S.me.email), ` — invited to ${(S.me.scopes || []).join(', ')}. Everything else in IRIS stays with the owner.`)) : null;
  const banner = S.preview ? h('div.preview-banner#preview-banner', { role: 'status' }, iconEl('eye'), h('span.grow', h('b', 'Preview · sample data'), ' — nothing here is live; no calls leave the browser and Money stays hidden.'), h('button.btn.btn-sm', { type: 'button', onclick: exitPreview }, 'Exit preview')) : null;
  const backend = (!S.preview && S.backendError) ? h('div.preview-banner#backend-banner', { role: 'status', style: { background: 'color-mix(in oklab, var(--sev-high) 12%, var(--background))', borderBottomColor: 'color-mix(in oklab, var(--sev-high) 45%, transparent)' } }, iconEl('alert'), h('span.grow', h('b', 'Backend not reachable'), ` — iris2_config_public: ${S.backendError.message}. Pages will show error states until the RPC v2 functions are deployed.`), h('button.btn.btn-sm', { type: 'button', onclick: () => enterAsOwner() }, iconEl('refresh'), 'Retry')) : null;
  const main = h('div.main', topbar, memberBanner, banner, backend, h('main.page#page', { tabindex: '-1' }));
  if (isMember()) { topbar.querySelector('#chip-spend')?.remove(); topbar.querySelector('#chip-gates')?.remove(); topbar.querySelector('#tell-btn')?.remove(); sidebar.querySelector('.sidebar-tell')?.remove(); }
  appEl = h('div.app#app', sidebar, main);
  root.append(appEl, renderBottomTabs());
  renderNav(); renderFooter(); renderChips();
  wireShellEvents();
  if (!location.hash || location.hash === '#' || location.hash === '#/' || (isMember() && !pageAllowed(parseHash().page))) history.replaceState(null, '', homeRoute());
  render(parseHash());
  if (!isMember()) { refreshKpis(); if (kpiTimer) clearInterval(kpiTimer); kpiTimer = setInterval(refreshKpis, CONFIG.KPI_REFRESH_MS); }
}
let shellWired = false;
function wireShellEvents() {
  if (shellWired) return; shellWired = true;
  on('kpis', renderChips); on('kpis', renderNav); on('counts', renderNav); on('counts', () => { const bt = $('#bottom-tabs'); if (bt) bt.replaceWith(renderBottomTabs()); updateNav(parseHash().page); });
  on('realtime', renderFooter); on('theme', renderFooter); on('pref', renderFooter);
  onRoute(render);
}
function teardownApp() {
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  if (kpiTimer) { clearInterval(kpiTimer); kpiTimer = null; }
  closePanel(); closeSheet(); closePopover();
  appEl = null; lastKey = null;
}
async function exitPreview() {
  setPreview(false);
  teardownApp();
  history.replaceState(null, '', location.pathname);
  showChecking('Leaving preview…');
  try { const session = await initSession(); if (session) { await enterAsOwner(); return; } } catch (e) { console.warn(e); }
  mountSignIn();
}

async function refreshKpis() {
  try {
    const d = await call('iris2_mission');
    setKpis(d && d.kpis);
    if (d && d.machine) { setCount('agents', d.machine.live_count); }
    S.kpisStale = false;
    emit('mission:data', d);
  } catch (e) {
    // A10: don't silently pretend the old numbers are current — mark them stale (last-good preserved).
    S.kpisStale = true;
  }
}

// ---------------------------------------------------------------- sidebar
function renderNav() {
  if (!appEl) return;
  const nav = $('#nav'); if (!nav) return; clear(nav);
  const route = parseHash();
  for (const g of GROUPS) {
    nav.append(h('div.nav-group', g));
    const entries = Object.entries(visiblePages()).filter(([, x]) => x.group === g); if (!entries.length) { nav.lastChild.remove(); continue; }
    for (const [key, p] of entries) {
      const c = p.count ? p.count() : null;
      const a = h('a.nav-item', { href: href('/' + key), 'data-page': key, title: `${p.title} (g ${p.key})`, class: route.page === key ? 'active' : '', 'aria-current': route.page === key ? 'page' : null }, iconEl(p.icon), h('span.nav-label', p.title));
      if (c != null && c !== '' && Number(c) > 0) a.append(h('span.nav-count', { class: p.hot ? 'hot' : '' }, fmt.int(c)));
      nav.append(a);
    }
  }
}
function updateNav(page) {
  $$('#nav .nav-item').forEach((a) => { const active = a.dataset.page === page; a.classList.toggle('active', active); if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  $$('.bottom-tabs a').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
}
function renderFooter() {
  if (!appEl) return;
  const f = $('#sidebar-footer'); if (!f) return; clear(f);
  const themeBtn = h('button.footer-row.footer-btn', { type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', title: 'Theme', onclick: (e) => openThemePopover(e.currentTarget) },
    h('span.hue-dot', { 'aria-hidden': 'true' }), h('span.label', `Theme · ${THEMES.find((t) => t.key === S.prefs.theme)?.label || 'Lens'} · ${MODES.find((m) => m.key === S.prefs.mode)?.label || 'Dark'}`), iconEl(MODES.find((m) => m.key === S.prefs.mode)?.icon || 'moon'));
  const rt = S.realtime;
  const dotCls = rt.state === 'live' ? 'ok' : rt.state === 'polling' ? 'warn' : rt.state === 'error' ? 'bad' : rt.state === 'connecting' ? 'checking' : '';
  const live = S.counts.agents != null ? ` · ${fmt.int(S.counts.agents)} agents live` : '';
  const rtLabel = S.preview ? `Sample stream${live}` : rt.state === 'live' ? `Realtime connected${live}` : rt.state === 'polling' ? `Polling every 30 s${live}` : rt.state === 'connecting' ? 'Connecting realtime…' : rt.state === 'error' ? 'Stream unavailable' : `Realtime idle${live}`;
  const rtBtn = h('button.footer-row.footer-btn', { type: 'button', title: S.preview ? 'Preview: synthetic events' : 'Realtime status — click to reconnect', onclick: () => { if (!S.preview) { reconnectStream(); toast({ title: 'Reconnecting realtime', message: 'Trying the iris:stream broadcast channel again.', duration: 2500 }); } } }, h('span.live-dot', { class: dotCls }), h('span.label', rtLabel));
  const who = S.preview ? 'preview · sample data' : `signed in as ${S.ownerState === 'verified' ? 'owner' : S.ownerState === 'unverified' ? 'ownership unverified' : S.ownerState === 'denied' ? 'not an owner' : '—'}`;
  const eng = h('div.footer-row.engine-row', { title: S.user?.email || '' }, iconEl('terminal'), h('span.label', `rpc v${(S.config && S.config.version) || CONFIG.RPC_VERSION} · ${who}`));
  f.append(themeBtn, rtBtn, eng);
}
export function openThemePopover(anchor) {
  const hues = h('div.hue-grid', THEMES.map((t) => h('button.hue-swatch', { type: 'button', 'aria-label': `${t.label} theme`, title: t.label, 'aria-pressed': S.prefs.theme === t.key ? 'true' : 'false', style: { '--sw': t.swatch }, onclick: (e) => { applyTheme(t.key); $$('.hue-swatch', e.currentTarget.parentNode).forEach((b) => b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false')); } })));
  const seg = h('div.seg', { role: 'group', 'aria-label': 'Colour mode' }, MODES.map((m) => h('button', { type: 'button', 'aria-pressed': S.prefs.mode === m.key ? 'true' : 'false', onclick: (e) => { applyTheme(undefined, m.key); $$('button', e.currentTarget.parentNode).forEach((b) => b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false')); } }, iconEl(m.icon), m.label)));
  openPopover(anchor, h('div.theme-pop', h('h4', 'Hue'), hues, h('h4', 'Mode'), seg), { placement: 'top-start' });
}
function openAvatarMenu(anchor) {
  const email = S.preview ? 'Preview · sample data' : (S.user?.email || 'Signed in');
  const role = S.preview ? 'no account · nothing is live' : (S.owner ? 'owner · allow-listed' : 'not an owner');
  const items = [
    h('div.menu-head', h('span.avatar.lg', S.preview ? iconEl('eye') : initials(S.user?.email || 'IR')), h('span.who', h('b', email), h('span', role))),
    h('div.menu-sep'),
    h('a.menu-item', { href: '#/settings', onclick: () => closePopover() }, iconEl('settings'), h('span.txt', h('span.name', 'Settings'))),
    h('button.menu-item', { type: 'button', onclick: () => { closePopover(); openShortcuts(); } }, iconEl('keyboard'), h('span.txt', h('span.name', 'Keyboard shortcuts'), h('span.sub', '? · g + letter · ⌘K · ⌘J'))),
    h('div.menu-sep'),
    S.preview
      ? h('button.menu-item', { type: 'button', onclick: () => { closePopover(); exitPreview(); } }, iconEl('logout'), h('span.txt', h('span.name', 'Exit preview'), h('span.sub', 'back to sign-in')))
      : h('button.menu-item', { type: 'button', onclick: async () => { closePopover(); await signOut(); } }, iconEl('logout'), h('span.txt', h('span.name', 'Sign out'), h('span.sub', 'ends this session on this device'))),
  ];
  openPopover(anchor, h('div', { style: { width: '280px' } }, items), { placement: 'bottom-end' });
}
function renderBottomTabs() {
  const tabs = h('nav.bottom-tabs#bottom-tabs', { 'aria-label': 'Pages' });
  for (const key of (isMember() ? Object.keys(visiblePages()) : PHONE_TABS)) {
    const p = PAGES[key];
    tabs.append(h('a', { href: href('/' + key), 'data-page': key, 'aria-label': p.title }, iconEl(p.icon), p.title, key === 'decisions' && (S.counts.decisions || 0) > 0 ? h('span.dotbadge', { 'aria-hidden': 'true' }) : null));
  }
  tabs.append(h('button', { type: 'button', 'aria-label': 'More pages', onclick: openMoreSheet }, iconEl('menu'), 'More'));
  return tabs;
}
function openMoreSheet() {
  const route = parseHash();
  const rest = Object.entries(PAGES).filter(([k]) => !PHONE_TABS.includes(k));
  openSheet({ title: 'More', body: h('div.more-grid', rest.map(([k, p]) => h('a', { href: href('/' + k), class: route.page === k ? 'active' : '', onclick: () => closeSheet() }, iconEl(p.icon), p.title))), foot: [h('button.btn', { type: 'button', onclick: () => { closeSheet(); openTell(); } }, iconEl('send'), 'Tell IRIS'), h('span.grow'), h('button.btn.btn-ghost', { type: 'button', onclick: () => closeSheet() }, 'Close')] });
}

// ---------------------------------------------------------------- topbar chips
function renderChips() {
  if (!appEl) return;
  const k = S.kpis; const sp = $('#chip-spend'); const gt = $('#chip-gates');
  if (!sp || !gt) return;
  clear(sp); clear(gt);
  if (!k) { sp.append(h('span.lbl', 'Spend today'), h('span.num', '—')); gt.append(h('span.lbl', 'Memory gates'), h('span.num', '—')); return; }
  const pct = k.spend_cap_usd ? (k.spend_today_usd / k.spend_cap_usd) : 0;
  sp.classList.toggle('warn', pct >= 0.8 && pct < 1); sp.classList.toggle('bad', pct >= 1);
  sp.append(h('span.lbl', 'Spend today'), h('span.num', `${fmt.money(k.spend_today_usd)} / ${fmt.money(k.spend_cap_usd, 0)}`));
  const g = k.gates || {}; const allGreen = g.green === g.total;
  gt.classList.toggle('warn', !allGreen);
  gt.append(h('span.lbl', 'Memory gates'), h('span.num', `${fmt.int(g.green)} / ${fmt.int(g.total)}`)); gt.title = `${fmt.int(g.green)} of ${fmt.int(g.total)} memory-isolation probes green${g.checked_at ? ` · checked ${fmt.ago(g.checked_at)}` : ''} — not feed health`;
}

// ---------------------------------------------------------------- routing
function resolve(route) {
  const fallback = isMember() ? 'markets' : 'mission';
  const allowed = PAGES[route.page] && pageAllowed(route.page);
  const p = allowed ? PAGES[route.page] : PAGES[fallback];
  const key = allowed ? route.page : fallback;
  const sub = p.subpages && route.parts[1] && p.subpages[route.parts[1]];
  return { key, page: p, entry: sub || p, subKey: sub ? route.parts[1] : null };
}
function render(route) {
  if (!appEl) return;
  const { key, entry, subKey } = resolve(route);
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  closePanel(); closePopover();
  const page = $('#page'); clear(page);
  $('#page-title').textContent = entry.title;
  $('#page-sub').textContent = entry.sub ? entry.sub() : '';
  document.title = `${entry.title} · IRIS Command`;
  updateNav(key);
  const wrap = h('div.ml-enter.stack');
  page.append(wrap);
  try {
    const r = entry.mod.render(wrap, route, { setSub: (t) => { $('#page-sub').textContent = t; } });
    if (typeof r === 'function') cleanup = r; else if (r && typeof r.then === 'function') r.then((c) => { if (typeof c === 'function') cleanup = c; }).catch((e) => { console.error(e); wrap.append(h('div.error-box', `This page failed to render: ${e.message || e}`)); });
  } catch (e) { console.error(e); wrap.append(h('div.error-box', `This page failed to render: ${e.message || e}. Try reloading.`)); }
  const routeKey = key + (subKey || '');
  if (lastKey !== routeKey) window.scrollTo({ top: 0 });
  lastKey = routeKey;
  window.__irisRendered = routeKey; // test hook: Playwright waits on this
}

// ---------------------------------------------------------------- Tell IRIS (⌘J)
export function openTell(prefill = '') {
  if (isSheetOpen()) { closeSheet(); return; }
  const ta = h('textarea.input', { placeholder: 'Note for Claude — a task, a correction, something you noticed. It lands in the inbox and the Pulse mails you a copy.', 'aria-label': 'Note for IRIS', rows: 4 });
  ta.value = prefill;
  const status = h('span.small.muted', S.preview ? 'Preview: the note is recorded locally only.' : `${modKey} ↵ to send · Esc to close`);
  const send = h('button.btn.btn-primary', { type: 'button' }, iconEl('send'), 'Send to IRIS');
  const doSend = async () => {
    const note = ta.value.trim();
    if (!note) { ta.focus(); return; }
    send.disabled = true; send.classList.add('busy'); status.textContent = 'Sending…';
    try {
      const d = await call('iris2_tell', { p_note: note }, { dedupe: false });
      closeSheet();
      toast({ title: 'Sent to IRIS', message: d && d.queued !== false ? `Inbox row ${d?.id ? String(d.id).slice(0, 12) : 'written'} · Pulse will pick it up from the outbox.` : 'Recorded.', kind: 'success' });
    } catch (e) { send.disabled = false; send.classList.remove('busy'); status.textContent = `Could not send · ${e.code || 'error'}: ${e.message}`; status.classList.add('bad'); }
  };
  send.addEventListener('click', doSend);
  ta.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); doSend(); } });
  openSheet({
    title: [iconEl('send'), 'Tell IRIS'], cls: 'tell-box',
    body: [ta, h('div.tell-hint', iconEl('info'), h('span', 'Goes through ', h('b', 'iris2_tell'), ' → ops.claude_inbox + an outbox row. The browser never calls n8n directly; every note is audited under your user id.'))],
    foot: [status, h('span.grow'), h('button.btn.btn-ghost', { type: 'button', onclick: () => closeSheet() }, 'Cancel'), send],
  });
  setTimeout(() => ta.focus(), 60);
}

// ---------------------------------------------------------------- command palette (⌘K)
function paletteActions() {
  const acts = [
    { icon: 'send', name: 'Tell IRIS', sub: `${modKey} J · note for Claude`, go: () => openTell() },
    { icon: S.prefs.mode === 'dark' ? 'sun' : 'moon', name: S.prefs.mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode', sub: 'appearance', go: () => applyTheme(undefined, S.prefs.mode === 'dark' ? 'light' : 'dark') },
    ...THEMES.map((t) => ({ icon: 'palette', name: `Theme · ${t.label}`, sub: 'hue', go: () => applyTheme(t.key) })),
    { icon: 'keyboard', name: 'Keyboard shortcuts', sub: '?', go: () => openShortcuts() },
    { icon: 'refresh', name: 'Refresh this page', sub: 'reload data', go: () => render(parseHash()) },
    { icon: 'external', name: 'Open ModelLens Web', sub: (S.config && S.config.modellens_web_url) || CONFIG.MODELLENS_WEB_URL, go: () => { const u = safeHref((S.config && S.config.modellens_web_url) || CONFIG.MODELLENS_WEB_URL); if (u) window.open(u, '_blank', 'noopener,noreferrer'); } },
    { icon: 'upload', name: 'Import a ModelLens bundle', sub: 'Projects › ModelLens', go: () => navigate('/projects/modellens', { import: 1 }) },
    { icon: 'estate', name: 'Find cashflow rentals', sub: 'Estate', go: () => navigate('/estate') },
    { icon: 'key', name: 'Rotate a machine token', sub: 'Governance', go: () => navigate('/governance', { action: 'rotate' }) },
    { icon: 'inbox', name: 'Decisions · content drafts', sub: 'kind=content', go: () => navigate('/decisions', { kind: 'content' }) },
    { icon: 'inbox', name: 'Decisions · claims', sub: 'kind=claim', go: () => navigate('/decisions', { kind: 'claim' }) },
    S.preview ? { icon: 'logout', name: 'Exit preview', sub: 'back to sign-in', go: () => exitPreview() } : { icon: 'logout', name: 'Sign out', sub: S.user?.email || '', go: () => signOut() },
  ];
  return acts;
}
export function openPalette() {
  if (paletteOpen) return;
  paletteOpen = true;
  const input = h('input', { type: 'text', placeholder: 'Search pages and actions…', 'aria-label': 'Search or command', autocomplete: 'off', spellcheck: 'false' });
  const list = h('div.palette-list', { role: 'listbox', id: 'palette-list' });
  const pal = h('div.palette', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Search or command' }, h('div.palette-input', iconEl('search'), input, h('kbd.kbd', 'esc')), list,
    h('div.palette-foot', h('span', h('kbd.kbd', '↑'), h('kbd.kbd', '↓'), ' navigate'), h('span', h('kbd.kbd', '↵'), ' open'), h('span', h('kbd.kbd', 'esc'), ' close')));
  const layer = openDialogLayer(pal, () => { paletteOpen = false; });
  let items = []; let sel = 0;
  const run = (q) => {
    clear(list); items = []; sel = 0;
    const ql = q.toLowerCase();
    const pages = Object.entries(visiblePages()).flatMap(([k, p]) => [{ icon: p.icon, name: p.title, sub: p.sub(), kbd: `g ${p.key}`, go: () => navigate('/' + k) }, ...Object.entries(p.subpages || {}).map(([sk, sp]) => ({ icon: p.icon, name: `${p.title} › ${sp.title}`, sub: sp.sub(), go: () => navigate(`/${k}/${sk}`) }))]).filter((it) => !ql || it.name.toLowerCase().includes(ql) || (it.sub || '').toLowerCase().includes(ql));
    const acts = paletteActions().filter((it) => !ql || it.name.toLowerCase().includes(ql) || (it.sub || '').toLowerCase().includes(ql));
    const groups = [{ label: 'Pages', items: ql ? pages : pages.slice(0, 14) }, { label: 'Actions', items: ql ? acts : acts.slice(0, 6) }];
    for (const g of groups) {
      if (!g.items.length) continue;
      list.append(h('div.palette-group', g.label));
      for (const it of g.items) {
        const i = items.length; items.push(it);
        list.append(h('div.palette-item', { role: 'option', id: `pal-${i}`, 'aria-selected': i === sel ? 'true' : 'false', onmouseenter: () => select(i), onclick: () => go(it) }, iconEl(it.icon), h('span.txt', h('span.name', highlight(it.name, q)), it.sub ? h('span.sub', highlight(it.sub, q)) : null), it.kbd ? h('kbd.kbd', it.kbd) : null));
      }
    }
    if (!items.length) list.append(h('div.empty', h('strong', 'No matches'), 'Try a page name (Mission, Estate…) or an action (theme, token, bundle).'));
  };
  const select = (i) => { sel = i; $$('.palette-item', list).forEach((el, j) => el.setAttribute('aria-selected', j === i ? 'true' : 'false')); const el = $$('.palette-item', list)[i]; if (el) el.scrollIntoView({ block: 'nearest' }); };
  const go = (it) => { layer.close(); setTimeout(() => it.go(), 10); };
  input.addEventListener('input', debounce(() => run(input.value.trim()), 40));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); select(Math.min(items.length - 1, sel + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); select(Math.max(0, sel - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[sel]) go(items[sel]); }
  });
  run('');
  setTimeout(() => input.focus(), 30);
}
function openDialogLayer(content, onClose) {
  const ov = h('div.overlay.palette-wrap', content);
  $('#overlays').appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('show'));
  const prev = document.activeElement;
  const close = () => { ov.classList.remove('show'); setTimeout(() => ov.remove(), 200); document.removeEventListener('keydown', onKey, true); onClose && onClose(); if (prev && prev.focus) prev.focus(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  return { close };
}

// ---------------------------------------------------------------- keyboard shortcuts
let chord = null; let chordTimer = null;
document.addEventListener('keydown', (e) => {
  if (!appEl) return;
  const tag = (e.target.tagName || '').toLowerCase(); const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (paletteOpen) return; closePopover(); openPalette(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); closePopover(); openTell(); return; }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '?') { e.preventDefault(); openShortcuts(); return; }
  if (e.key === '/') { e.preventDefault(); openPalette(); return; }
  if (chord === 'g') {
    chord = null; clearTimeout(chordTimer);
    const target = Object.entries(visiblePages()).find(([, p]) => p.key === e.key.toLowerCase());
    if (target) { e.preventDefault(); navigate('/' + target[0]); }
    return;
  }
  if (e.key.toLowerCase() === 'g' && !hasOpenLayer() && !isPopoverOpen()) { chord = 'g'; chordTimer = setTimeout(() => { chord = null; }, 900); }
});
export function openShortcuts() {
  const rows = [[`${modKey} K`, 'Search or command'], ['/', 'Search or command'], [`${modKey} J`, 'Tell IRIS'], ['?', 'This help'], ['Esc', 'Close drawer, dialog or sheet'],
    ...Object.entries(PAGES).map(([, p]) => [`g ${p.key}`, p.title]), ['↑ ↓ ↵', 'Navigate palette results'], [`${modKey} ↵`, 'Send (Tell IRIS, Ask the brain)']];
  openDialog({ title: 'Keyboard shortcuts', body: h('div.shortcuts', rows.map(([k, d]) => h('div.shortcut', h('span', d), h('span.keys', k.split(' ').map((x) => h('kbd.kbd', x)))))), actions: [{ label: 'Close', class: 'btn-ghost' }] });
}

// expose a few things for pages
export { render, refreshKpis, exitPreview };
window.__iris = { S, navigate, openTell, openPalette };

// ---------------------------------------------------------------- boot
applyTheme(); applyDensity();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S.prefs.mode === 'system') applyTheme(); });
root = $('#root');

(async function boot() {
  if (S.preview) { mountApp(); return; }
  showChecking('Restoring your session…');
  let session = null;
  try { session = await initSession(); } catch (e) { console.error(e); showAuthUnavailable(e); return; }
  if (urlHasAuthCallback()) history.replaceState(null, '', location.pathname + '#/cortex');
  if (!session) { mountSignIn(); return; }
  await enterAsOwner();
})();
