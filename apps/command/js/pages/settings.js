// Settings: theme (six hues, light/dark/system), density, notifications note, session (sign out), about.

import { h, fmt } from '../util.js';
import { iconEl } from '../icons.js';
import { S, on } from '../store.js';
import { CONFIG } from '../config.js';
import { applyTheme, applyDensity, THEMES, MODES, DENSITIES } from '../theme.js';
import { signOut } from '../auth.js';
import { pill, confirmDialog, toast } from '../ui.js';
import { card } from './_common.js';
import { exitPreview, openShortcuts } from '../app.js';

export function render(root) {
  const host = h('div.stack');
  root.append(host);
  const hues = h('div.hue-grid', { style: { padding: 0 } }, THEMES.map((t) => h('button.hue-swatch.lg', { type: 'button', 'aria-label': `${t.label} theme`, title: t.label, 'aria-pressed': S.prefs.theme === t.key ? 'true' : 'false', style: { '--sw': t.swatch }, onclick: () => { applyTheme(t.key); hues.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.title === t.label ? 'true' : 'false')); } })));
  const modes = h('div.seg', { role: 'group', 'aria-label': 'Colour mode' }, MODES.map((m) => h('button', { type: 'button', 'aria-pressed': S.prefs.mode === m.key ? 'true' : 'false', onclick: (e) => { applyTheme(undefined, m.key); modes.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false')); } }, iconEl(m.icon), m.label)));
  const dens = h('div.seg', { role: 'group', 'aria-label': 'Density' }, DENSITIES.map((d) => h('button', { type: 'button', 'aria-pressed': S.prefs.density === d.key ? 'true' : 'false', onclick: (e) => { applyDensity(d.key); dens.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false')); } }, d.label)));

  host.append(card(h('h2', 'Appearance'), 'same tokens as ModelLens Web · stored on this device', [
    row('Hue', 'Six brand hues derived from one OKLCH token. Severity colours never change with the hue.', hues),
    row('Mode', 'Light, dark, or follow the system. Every colour is defined in both modes.', modes),
    row('Density', 'Compact tightens row padding on lists and tables.', dens),
  ]));
  host.append(card(h('h2', 'Notifications'), null, [
    row('Pulse', 'IRIS never pushes from the browser. Notes you send with Tell IRIS become an outbox row; the n8n Pulse mails you a copy and can SMS you for hot proposals. Configure cadence in n8n → Pulse.', pill('outbox', 'status neutral nodot mono')),
    row('Realtime', `Live thinking arrives over the private broadcast channel ${(S.config && S.config.realtime_channel) || CONFIG.REALTIME_CHANNEL}; if the channel drops, the page polls iris2_stream every ${CONFIG.STREAM_POLL_MS / 1000} s.`, pill(S.realtime.state, `status ${S.realtime.state === 'live' ? 'good' : 'neutral'}`)),
  ]));
  const who = S.preview ? 'Preview · sample data' : (S.user?.email || '—');
  host.append(card(h('h2', 'Session'), null, [
    row('Signed in as', who, S.preview ? pill('preview', 'status warn nodot') : pill(S.owner ? 'owner' : 'not an owner', `status ${S.owner ? 'good' : 'bad'} nodot`)),
    row('Keyboard', 'Every page has a g + letter shortcut; ⌘K opens search, ⌘J opens Tell IRIS.', h('button.btn.btn-sm', { type: 'button', onclick: () => openShortcuts() }, iconEl('keyboard'), 'Shortcuts')),
    row(S.preview ? 'Leave preview' : 'Sign out', S.preview ? 'Return to the sign-in screen.' : 'Ends the session on this device. Other devices stay signed in.', S.preview ? h('button.btn', { type: 'button', onclick: () => exitPreview() }, iconEl('logout'), 'Exit preview') : h('button.btn.btn-danger', { type: 'button', onclick: async () => { const ok = await confirmDialog({ title: 'Sign out?', message: 'You will need the password or a magic link to get back in.', confirmText: 'Sign out', danger: true }); if (ok) await signOut(); } }, iconEl('logout'), 'Sign out')),
  ]));
  host.append(card(h('h2', 'About'), null, [
    row('IRIS Command', `Version ${CONFIG.APP_VERSION} · RPC contract v${(S.config && S.config.version) || CONFIG.RPC_VERSION} · static web app, no build step.`, pill(`v${CONFIG.APP_VERSION}`, 'status primary nodot mono')),
    row('Backend', h('span.mono', CONFIG.SUPABASE_URL.replace(/^https?:\/\//, '')), h('span.small.muted', 'PostgREST · public.iris2_*')),
    row('ModelLens Web', h('span.mono', (S.config && S.config.modellens_web_url) || CONFIG.MODELLENS_WEB_URL), h('a.btn.btn-sm', { href: (S.config && S.config.modellens_web_url) || CONFIG.MODELLENS_WEB_URL, target: '_blank', rel: 'noopener noreferrer' }, iconEl('external', 'ic-14'), 'Open')),
    row('Security', 'No secrets in the client except the publishable key. Every write is an audited RPC; the browser never calls n8n. CSP restricts scripts to this origin and cdnjs.', pill('CSP strict', 'status good nodot')),
  ]));
  return () => {};
}
const row = (k, d, right) => h('div.settings-row', h('div', h('div.k', k), h('div.d', d)), h('div', right));
