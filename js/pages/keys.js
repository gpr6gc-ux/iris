// System › Vault — every key, token, and connection in one place, each with a live verified status.
// Values go straight from your browser into the encrypted vault (iris2_secret_set): never shown back,
// never in a report, never seen by the assistant. Workers read allow-listed keys server-side via
// iris_secret_get; a verifier probes each provider and writes the real connection status.

import { h, fmt } from '../util.js';
import { iconEl } from '../icons.js';
import { call } from '../api.js';
import { toast, pill, openDialog, confirmDialog, switchEl, emptyState } from '../ui.js';
import { load } from './_common.js';
import { setCount } from '../store.js';

const SETTABLE = /^[A-Z][A-Z0-9_]{1,63}$/;
const VERIFY_URL = 'https://gragone.app.n8n.cloud/webhook/iris-vault-verify-7a3f9c2e';

const KIND_LABEL = { api_key: 'API key', token: 'token', credential: 'credential', mcp: 'MCP', subscription: 'subscription' };
const DOMAIN_LABEL = { markets: 'Investing', real_estate: 'Real estate', estate: 'Real estate', discord: 'Discord', memory: 'Memory', finance: 'Finance', system: 'System', general: 'General' };

// Resolve a key's live status into one visual state.
function statusOf(s) {
  if (!s.present) return s.required ? { k: 'missing', label: 'required · missing', tone: 'bad' } : { k: 'unset', label: 'not set', tone: 'idle' };
  if (s.verify_status === 'ok') return { k: 'ok', label: 'connected', tone: 'good' };
  if (s.verify_status === 'failing') return { k: 'failing', label: 'failing', tone: 'bad' };
  if (s.verify_status === 'unverifiable') return { k: 'stored', label: 'stored', tone: 'neutral' };
  return { k: 'unverified', label: 'stored · unverified', tone: 'warn' };
}

export function render(root) {
  const host = h('div.stack');
  root.append(host);
  load(host, 'iris2_vault', {}, draw);
  return () => {};
}

function draw(data, host, reload) {
  const items = (data && data.items) || [];
  const sum = (data && data.summary) || {};
  try { setCount('keysMissing', sum.missing_required || null); } catch { /* ignore */ }

  host.append(hero(sum, items, reload));
  if (!items.length) { host.append(emptyState('Vault empty', 'No keys registered yet. Add one to get started.')); return; }

  // group by domain, required-missing first (already ordered by the RPC)
  const groups = [];
  const seen = {};
  for (const it of items) {
    const raw = it.domain || 'general';
    const d = raw === 'estate' ? 'real_estate' : raw; // merge the two RE domains under one label
    if (!seen[d]) { seen[d] = { domain: d, items: [] }; groups.push(seen[d]); }
    seen[d].items.push(it);
  }
  for (const g of groups) {
    host.append(h('div.vault-group-label', DOMAIN_LABEL[g.domain] || g.domain));
    const grid = h('div.vault-grid');
    for (const s of g.items) grid.append(keyCard(s, reload));
    host.append(grid);
  }
}

function hero(sum, items, reload) {
  const total = sum.total || items.length;
  const present = sum.present || 0;
  const ok = sum.verified_ok || 0;
  const failing = sum.failing || 0;
  const missing = sum.missing_required || 0;

  const stat = (n, label, tone) => h('div.vault-stat', { class: `tone-${tone || 'neutral'}` },
    h('div.vs-n', fmt.int(n)), h('div.vs-l', label));

  const verifyBtn = h('button.btn.btn-sm.btn-primary', { type: 'button', onclick: (e) => verifyAll(e.currentTarget, reload) }, iconEl('activity', 'ic-14'), 'Verify all');
  const addBtn = h('button.btn.btn-sm', { type: 'button', onclick: () => addNewKey(reload) }, iconEl('plus', 'ic-14'), 'Add key');

  return h('div.card.vault-hero',
    h('div.vault-hero-top',
      h('div.vault-title', iconEl('lock'), h('h2', 'Vault'),
        h('span.vault-sub', 'every key · live connection status')),
      h('div.vault-actions', verifyBtn, addBtn)),
    h('div.vault-stats',
      stat(total, 'registered', 'neutral'),
      stat(present, 'stored', 'primary'),
      stat(ok, 'connected', ok ? 'good' : 'neutral'),
      stat(failing, 'failing', failing ? 'bad' : 'neutral'),
      stat(missing, 'missing', missing ? 'bad' : 'good')),
    h('div.vault-note', iconEl('shield', 'ic-14'),
      h('span', 'Values live in an encrypted vault — never shown back, never seen by the assistant. Allow-listed keys are read by workers server-side; a verifier probes each provider for the real status below.')));
}

function keyCard(s, reload) {
  const settable = SETTABLE.test(s.key_name);
  const st = statusOf(s);
  const kind = KIND_LABEL[s.kind] || s.kind || 'key';

  const dot = h('span.vault-dot', { class: `st-${st.k}`, 'aria-hidden': 'true' });
  const title = (s.purpose && s.purpose !== '(user-added integration)') ? s.purpose : s.key_name;

  const meta = [];
  if (s.present && s.value_len) meta.push(`${fmt.int(s.value_len)} chars`);
  if (!s.present && s.set_via && s.set_via !== 'command_center') meta.push(String(s.set_via).replace(/_/g, ' '));
  if (s.verified_at) meta.push(`checked ${fmt.ago(s.verified_at)}`);
  const metaLine = meta.length ? meta.join(' · ') : (s.present ? 'stored' : 'not set');

  // worker-readable toggle (only meaningful for stored, settable keys)
  const readRow = settable ? h('div.vault-read',
    h('span.vr-label', iconEl('agents', 'ic-14'), 'Workers can read'),
    switchEl(!!s.worker_readable, async (next) => {
      try { await call('iris2_vault_set_readable', { p_key_name: s.key_name, p_readable: next }, { dedupe: false });
        toast({ title: `${s.key_name} · ${next ? 'workers can read' : 'workers blocked'}`, kind: 'success' }); return true; }
      catch (e) { toast({ title: 'Could not update', message: e.message, kind: 'error' }); return false; }
    }, { label: `Workers can read ${s.key_name}` })) : null;

  const actions = h('div.vault-card-actions');
  if (settable) {
    actions.append(h('button.btn.btn-xs', { type: 'button', onclick: () => setKey(s, reload) }, iconEl(s.present ? 'refresh' : 'plus'), s.present ? 'Update' : 'Set'));
    if (s.present) actions.append(h('button.btn.btn-xs.btn-ghost', { type: 'button', onclick: () => clearKey(s, reload) }, iconEl('trash'), 'Clear'));
  } else {
    actions.append(h('span.small.muted', `managed via ${s.set_via ? String(s.set_via).replace(/_/g, ' ') : 'n8n'}`));
  }

  const card = h('div.card.vault-card', { class: `st-${st.k}`, dataset: { key: s.key_name } },
    h('div.vault-card-top',
      h('div.vault-card-id', dot, h('div', h('div.vc-title', title), h('div.vc-key', s.key_name))),
      pill(kind, 'status neutral nodot vault-kind')),
    h('div.vault-card-status',
      h('span.vc-status-label', { class: `tone-${st.tone}` }, st.label),
      s.unblocks ? h('span.vc-unblocks', `unblocks ${s.unblocks}`) : null),
    h('div.vault-card-meta', metaLine),
    readRow,
    actions);
  return card;
}

async function verifyAll(btn, reload) {
  const cards = document.querySelectorAll('.vault-card');
  cards.forEach((c) => c.classList.add('scanning'));
  if (btn) { btn.disabled = true; btn.classList.add('busy'); }
  try {
    // Fire-and-forget: no-cors + a simple content type (plain-text body, no custom headers)
    // avoids the CORS preflight that was silently blocking this POST client-side. The response
    // is opaque, but the verifier runs server-side; we reload to show the freshly-written status.
    await fetch(VERIFY_URL, { method: 'POST', mode: 'no-cors', body: 'command_center' });
    toast({ title: 'Verifying connections…', message: 'Probing every provider now — statuses refresh in about ten seconds.', kind: 'info' });
    setTimeout(reload, 12000);
  } catch (e) {
    cards.forEach((c) => c.classList.remove('scanning'));
    if (btn) { btn.disabled = false; btn.classList.remove('busy'); }
    toast({ title: 'Could not reach the verifier', message: 'The network looks down — try again in a moment.', kind: 'warn', duration: 6000 });
  }
}

function addNewKey(reload) {
  const nameIn = h('input.input', { type: 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters', 'aria-label': 'Key name', placeholder: 'UPPER_SNAKE_CASE, e.g. REVID_API_KEY' });
  const valIn = h('input.input', { type: 'password', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Key value', placeholder: 'Paste the key or token' });
  openDialog({
    title: 'Add a key to the vault',
    sub: 'Registers a new slot and stores the value encrypted — never shown back, never seen by the assistant.',
    glow: true,
    body: h('div.stack',
      h('div.field', h('label', 'Key name'), nameIn),
      h('div.field', h('label', 'Value'), valIn),
      h('div.small.muted', 'Name must be UPPER_SNAKE_CASE — e.g. REVID_API_KEY, STRIPE_WEBHOOK_SECRET.')),
    actions: [
      { label: 'Cancel', class: 'btn-ghost' },
      { label: 'Save to vault', class: 'btn-primary', icon: 'lock', onClick: async () => {
        const name = (nameIn.value || '').trim().toUpperCase();
        const val = valIn.value;
        if (!SETTABLE.test(name)) { toast({ title: 'Invalid key name', message: 'Use UPPER_SNAKE_CASE (2–64 chars, start with a letter).', kind: 'warn' }); return false; }
        if (!val || !val.trim()) { toast({ title: 'Nothing to save', kind: 'warn' }); return false; }
        try { await call('iris2_secret_set', { p_key_name: name, p_value: val }, { dedupe: false });
          toast({ title: `${name} saved`, message: 'Stored in the vault. Toggle "Workers can read" to let workflows use it.', kind: 'success' }); reload(); }
        catch (e) { toast({ title: 'Could not save', message: `${e.code || 'error'}: ${e.message}`, kind: 'error', duration: 7000 }); return false; }
      } },
    ],
  });
  setTimeout(() => { try { nameIn.focus(); } catch { /* ignore */ } }, 60);
}

function setKey(s, reload) {
  const input = h('input.input', { type: 'password', autocomplete: 'off', spellcheck: 'false', 'aria-label': `${s.key_name} value`, placeholder: 'Paste the key or token' });
  const desc = (s.purpose && s.purpose !== '(user-added integration)') ? s.purpose : 'Stored encrypted; read server-side only by the workflow that needs it.';
  openDialog({
    title: `Set ${s.key_name}`,
    sub: 'Sent straight to the encrypted vault — never shown back, never seen by the assistant.',
    glow: true,
    body: h('div.stack', h('div.field', h('label', 'Value'), input), h('div.small.muted', desc)),
    actions: [
      { label: 'Cancel', class: 'btn-ghost' },
      { label: 'Save to vault', class: 'btn-primary', icon: 'lock', onClick: async () => {
        const v = input.value;
        if (!v || !v.trim()) { toast({ title: 'Nothing to save', kind: 'warn' }); return false; }
        try { await call('iris2_secret_set', { p_key_name: s.key_name, p_value: v }, { dedupe: false });
          toast({ title: `${s.key_name} saved`, message: 'Stored — the workflow picks it up on its next run.', kind: 'success' }); reload(); }
        catch (e) { toast({ title: 'Could not save', message: `${e.code || 'error'}: ${e.message}`, kind: 'error', duration: 7000 }); return false; }
      } },
    ],
  });
  setTimeout(() => { try { input.focus(); } catch { /* ignore */ } }, 60);
}

async function clearKey(s, reload) {
  const ok = await confirmDialog({ title: `Clear ${s.key_name}?`, message: 'Removes the stored value from the vault. Any workflow that reads it stops working until you set it again.', confirmText: 'Clear', danger: true });
  if (!ok) return;
  try { await call('iris2_secret_clear', { p_key_name: s.key_name }, { dedupe: false }); toast({ title: `${s.key_name} cleared`, kind: 'success' }); reload(); }
  catch (e) { toast({ title: 'Could not clear', message: `${e.code || 'error'}: ${e.message}`, kind: 'error', duration: 7000 }); }
}
