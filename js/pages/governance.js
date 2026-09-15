// Governance (Governance.dc.html): spend + caps + meters, gates, machine tokens (rotate → Vault secret name only, revoke),
// audit log, security posture with status pills, failing n8n workflows.

import { h, fmt, clear } from '../util.js';
import { iconEl } from '../icons.js';
import { call } from '../api.js';
import { toast, pill, emptyState, openDialog, confirmDialog, openPanel, sevPill, segmented } from '../ui.js';
import { load, card, kpi, statePill, agentPill } from './_common.js';

export function render(root, route) {
  const host = h('div.stack');
  root.append(host);
  load(host, 'iris2_governance', {}, (d, el, reload) => { draw(d, el, reload); if (route.params.get('action') === 'rotate') setTimeout(() => rotate(reload), 300); });
  return () => {};
}

function draw(d, host, reload) {
  const sp = d.spend || {}; const gates = d.gates || {}; const sec = d.security || []; const n8n = d.n8n || {}; const tokens = d.tokens || []; const audit = d.audit || []; const meters = d.meters || [];
  const open = sec.filter((s) => s.status !== 'fixed'); const critFixed = sec.filter((s) => s.severity === 'critical' && s.status === 'fixed').length;
  const capHard = (sp.caps || []).filter((c) => c.hard).map((c) => `${fmt.money(c.cap_usd, 0)} / ${c.key}`).join(' · ');
  host.append(h('div.kpis',
    kpi('wallet', 'Spend · 24h / 7d', `${fmt.money(sp.today_usd)} / ${fmt.money(sp.week_usd)}`, `${fmt.int(sp.governed_workflows)} of ${fmt.int(sp.total_llm_workflows)} LLM workflows governed`),
    kpi('shield', 'Denials · 24h', fmt.int(sp.denials_live ?? 0), `${fmt.int((sp.denials || []).length)} all-time${capHard ? ` · hard caps: ${capHard}` : ' · no hard caps set'}`, (sp.denials_live ?? 0) ? 'warn' : 'good'),
    kpi('bolt', 'n8n executions', n8n.executions_per_day != null ? `≈${fmt.int(n8n.executions_per_day)} / day` : '—', `${n8n.quota_month ? `≈ ${fmt.compact(n8n.executions_per_day * 30)} / month vs ${fmt.compact(n8n.quota_month)} quota · ` : ''}estimate from a manual meter snapshot${(meters.find((m) => m.name === 'n8n_executions') || {}).updated_at ? ` (${fmt.ago((meters.find((m) => m.name === 'n8n_executions') || {}).updated_at)})` : ''}`, n8n.quota_month && n8n.executions_per_day * 30 > n8n.quota_month ? 'warn' : ''),
    kpi('lock', 'Security posture', `${fmt.int(open.length)} open`, `of ${fmt.int(sec.length)} audit findings · ${fmt.int(critFixed)} critical fixed`, open.length ? 'warn' : 'good')));

  // ---- security + tokens
  const secTone = (s) => s === 'fixed' ? 'good' : s === 'owner' ? 'bad' : 'warn';
  const secLabel = (s) => s === 'owner' ? 'you' : s;
  const secCard = card(h('h2', 'Security posture'), 'from the audits · tracked to closure', sec.length ? h('div.list.tight', sec.slice().sort((a, b) => rank(a) - rank(b)).map((s) => h('div.item.sec-row', { class: `stripe-${s.status === 'fixed' ? 'GOOD' : s.status === 'owner' ? 'HIGH' : 'MEDIUM'}` }, pill(secLabel(s.status), `status ${secTone(s.status)} nodot`), h('div.txt', s.title, s.owner_action ? h('div.small.muted', s.owner_action) : null), s.status === 'owner' ? h('button.btn.btn-sm', { type: 'button', onclick: () => runbook(s, reload) }, 'Runbook') : h('button.btn.btn-xs.btn-ghost', { type: 'button', title: 'Change status', 'aria-label': `Change status of ${s.id}`, onclick: () => updateSecurity(s, reload) }, h('span.right', s.source ? s.source.replace(/^IRIS_(COMMAND|BACKEND)_AUDIT /, '') : s.id))))) : emptyState('No findings tracked', 'Security findings come from the audits.'), { glow: true, cls: 'f12' });
  const tokCard = card(h('h2', 'Machine tokens'), h('button.btn.btn-sm', { type: 'button', onclick: () => rotate(reload) }, iconEl('refresh'), 'Rotate'), tokens.length ? h('div.tbl-wrap', h('table.tbl.compact', h('thead', h('tr', h('th', 'Label'), h('th', 'Scopes'), h('th.hide-sm', 'Last used'), h('th', h('span.sr-only', 'Actions')))), h('tbody', tokens.map((t) => h('tr', { class: t.revoked_at ? 'decided' : '' }, h('td.wrap', h('b', t.label), ' ', t.legacy ? pill('legacy', 'status bad nodot') : null, t.revoked_at ? pill('revoked', 'status neutral nodot') : null, t.expires_at ? h('div.small.muted', `expires ${fmt.day(t.expires_at)}`) : null), h('td.mono-cell', { style: { whiteSpace: 'normal' } }, (t.scopes || []).join(' ') === '*' ? 'all' : (t.scopes || []).join(' ')), h('td.muted.nowrap.hide-sm', t.last_used_at ? fmt.ago(t.last_used_at) : 'never'), h('td.actions', !t.revoked_at ? h('button.btn.btn-sm.btn-danger', { type: 'button', onclick: () => revoke(t, reload) }, 'Revoke') : null)))))) : emptyState('No machine tokens', 'Rotate creates the first scoped token.'), { flush: true, cls: 'f1' });
  tokCard.querySelector('.card-head').style.padding = '14px 16px 6px';
  host.append(h('div.row.wrap-md', secCard, tokCard));

  // ---- audit + spend by agent
  const actorTone = (k) => k === 'owner' ? 'primary' : k === 'cron' ? 'neutral' : 'info';
  const auditCard = card(h('h2', 'Audit log'), 'ops.audit_log · every write, human or machine', audit.length ? h('div.tbl-wrap', h('table.tbl.compact', h('thead', h('tr', h('th', 'At'), h('th', 'Actor'), h('th', 'Action'), h('th.hide-sm', 'Object'))), h('tbody', audit.map((a) => h('tr', h('td.mono-cell', fmt.timeS(a.at)), h('td', pill(a.actor_kind, `status ${actorTone(a.actor_kind)} nodot`), ' ', a.actor_id), h('td', a.action), h('td.mono-cell.hide-sm', `${a.object_type}${a.object_id ? ` · ${String(a.object_id).slice(0, 12)}` : ''}`)))))) : emptyState('Audit log empty', 'Every RPC v2 write appends a row here.'), { flush: true, cls: 'f1' });
  auditCard.querySelector('.card-head').style.padding = '14px 16px 6px';
  const byAgent = (sp.by_agent || []).slice().sort((a, b) => b.usd - a.usd); const max = Math.max(0.01, ...byAgent.map((a) => a.usd));
  /* ADMISSION, BESIDE THE SPEND IT GOVERNS. The bars answer "who spent what"; on their own they
     cannot answer the question a governor exists for — "did that agent ask permission first?" An
     ungoverned agent's bar looked identical to a governed one.
     The window is CLAMPED to the first reservation ever taken and says so: ops.spend_ledger starts
     weeks before ops.spend_reservations, and comparing them over a shared 7-day window invents
     unadmitted spend that never happened (it briefly reported 24.2% when the real figure is 0). */
  const adm = sp.admission || {};
  const spendCard = card(h('h2', 'Spend by agent · 7d'), fmt.money(sp.week_usd), [byAgent.length ? h('div.capbars.spend-rows', byAgent.map((a) => h('div.capbar', { class: a.admitted === false ? 'unadmitted' : '' }, h('span.name', { title: `${fmt.int(a.calls)} calls${a.reservations != null ? ` · ${fmt.int(a.reservations)} reservations` : ''}` }, a.agent), h('div.bar', h('i', { style: { width: `${100 * a.usd / max}%` } })), h('span.vals', h('b', fmt.money(a.usd)), a.admitted === false ? h('span.ungoverned', { title: 'Spent without ever calling iris_spend_check — it cannot be denied, and it does not stop when you pause autonomy' }, 'ungoverned') : null)))) : emptyState('No spend', 'The ledger has no rows this week.'),
    admissionLine(adm),
    (sp.by_model || []).length ? h('div.pills', ...sp.by_model.map((m) => pill(`${m.model} · ${fmt.money(m.usd)}`, 'status neutral nodot mono'))) : null], { cls: 'f08' });
  host.append(h('div.row.wrap-md', auditCard, spendCard));

  // ---- caps + meters + gates + n8n
  const capsCard = card(h('h2', 'Caps & meters'), 'hard caps deny · soft caps warn', [
    h('div.capbars', ...(sp.caps || []).map((c) => h('div.capbar', { class: c.pct >= 100 ? 'at-cap' : '' }, h('span.name', { title: c.note || '' }, `${c.scope} · ${c.key}`), h('div.bar', h('i', { class: c.pct >= 80 ? 'warn' : '', style: { width: `${Math.min(100, c.pct || 0)}%` } })), h('span.vals', h('b', fmt.money(c.spent_usd)), ` / ${fmt.money(c.cap_usd, 0)}${c.hard ? '' : ' soft'}`)))),
    meters.length ? h('div.divider') : null,
    h('div.capbars', ...meters.map((m) => h('div.capbar', { class: m.pct >= 100 ? 'at-cap' : '' }, h('span.name', { title: m.detail || '' }, m.label, h('span.small.muted', ` · ${m.source || 'unknown'}${m.updated_at ? ` · ${fmt.ago(m.updated_at)}` : ''}`)), h('div.bar', h('i', { class: m.pct >= 100 ? 'bad' : m.pct >= 80 ? 'warn' : '', style: { width: `${Math.min(100, m.pct || 0)}%` } })), h('span.vals', h('b', m.value == null ? '—' : meterVal(m.value, m.unit)), m.cap == null ? h('span.muted', ' · no cap') : ` / ${meterVal(m.cap, m.unit, true)}`)))),
    h('div.small.muted', { style: { marginTop: '6px' } }, 'live = measured now · snapshot = typed in by hand on the date shown · estimate = computed from call counts, not billed usage · socket = no source connected')], { cls: 'f1' });
  const rows = gates.rows || [];
  // gates = 17 memory-isolation / recall probes (brain.gates_green), not system health; rows lists only failing probes ("gate: probe" strings or objects)
  const failing = rows.map((g) => typeof g === 'string' ? { gate: g, state: 'red' } : g).filter((g) => g && (g.state ? g.state !== 'green' : true));
  const gatesCard = card(h('h2', 'Memory gates'), pill(`${fmt.int(gates.green)} / ${fmt.int(gates.total)} probes green`, `status ${gates.all_green || gates.green === gates.total ? 'good' : 'bad'}`), [
    h('div.small.muted', `${fmt.int(gates.total)} isolation and recall probes run hourly by the Gatekeeper · checked ${gates.checked_at ? fmt.ago(gates.checked_at) : '—'} · this is memory safety, not feed health`),
    failing.length ? h('div.pills', failing.map((g) => pill(g.gate || g.probe || String(g), `status ${g.state === 'amber' ? 'warn' : 'bad'} mono`))) : (gates.total ? h('div.notice.good', iconEl('check-circle'), h('span', 'All probes passed on the last run.')) : emptyState('No gate run recorded', '')),
    (n8n.failing || []).length ? h('div.list.tight', h('div.small.muted', { style: { marginTop: '4px' } }, 'Failing n8n workflows'), ...n8n.failing.map((w) => h('div.item.stripe-HIGH', h('div.grow', h('div', h('b', w.workflow), ' ', h('span.mono.small.muted', w.id)), h('div.sub', w.last_error)), h('span.small.muted.nowrap', `since ${fmt.day(w.since)}`)))) : h('div.notice.good', iconEl('check-circle'), h('span', 'No failing n8n workflows.'))], { cls: 'f1' });
  host.append(h('div.row.wrap-md', capsCard, gatesCard));
  host.append(membersCard());
}

// ---- members: invited accounts that see one slice of the room (today: the Investing tab)
function membersCard() {
  const box = h('div.stack');
  const cardEl = card(h('h2', 'Members'), h('button.btn.btn-sm', { type: 'button', onclick: () => invite(() => loadMembers()) }, iconEl('plus'), 'Invite'), box, { cls: 'f1' });
  const loadMembers = () => load(box, 'iris2_members', {}, (d) => {
    clear(box);
    const rows = d.members || [];
    box.append(h('div.small.muted', 'A member signs in with a magic link to the invited email and sees only the pages their scope covers. Owners keep everything. Revoking takes effect on the member’s next request.'));
    box.append(rows.length ? h('div.tbl-wrap', h('table.tbl.compact', h('thead', h('tr', h('th', 'Email'), h('th', 'Scopes'), h('th', 'Status'), h('th.hide-sm', 'Last seen'), h('th', h('span.sr-only', 'Actions')))), h('tbody', rows.map((m) => h('tr', { class: m.revoked_at ? 'decided' : '' },
      h('td.wrap', h('b', m.email), m.label ? h('div.small.muted', m.label) : null),
      h('td.mono-cell', (m.scopes || []).join(' ')),
      h('td', pill(m.status, `status ${m.status === 'active' ? 'good' : m.status === 'invited' ? 'warn' : 'neutral'} nodot`)),
      h('td.muted.nowrap.hide-sm', m.last_seen_at ? fmt.ago(m.last_seen_at) : m.status === 'invited' ? 'never signed in' : '—'),
      h('td.actions', !m.revoked_at ? h('button.btn.btn-sm.btn-danger', { type: 'button', onclick: () => revokeMember(m, loadMembers) }, 'Revoke') : h('button.btn.btn-sm', { type: 'button', onclick: () => reinstate(m, loadMembers) }, 'Reinstate')))))))
      : emptyState('No members', 'Invite someone to give them the Investing tab and nothing else.'));
  });
  loadMembers();
  return cardEl;
}
function invite(reload) {
  const email = h('input.input', { type: 'email', placeholder: 'name@example.com', 'aria-label': 'Email', id: 'mem-email', autocomplete: 'off' });
  const label = h('input.input', { type: 'text', placeholder: 'Discord handle or a note', 'aria-label': 'Label', id: 'mem-label' });
  const result = h('div', { hidden: true });
  const dlg = openDialog({ title: 'Invite a member', sub: 'They get the Investing tab. Money, Careers, agents, approvals and every owner function stay closed to them.', glow: true,
    body: h('div.stack', h('div.field', h('label', { for: 'mem-email' }, 'Email'), email), h('div.field', h('label', { for: 'mem-label' }, 'Label (optional)'), label), h('div.field', h('label', 'Scope'), h('div.chips', pill('investing', 'status primary nodot'))), result),
    actions: [{ label: 'Close', class: 'btn-ghost' }, { label: 'Invite', class: 'btn-primary', icon: 'send', close: false, onClick: async (btn) => {
      const em = email.value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { email.focus(); return false; }
      try {
        await call('iris2_member_set', { p_email: em, p_scopes: ['investing'], p_label: label.value.trim() || null }, { dedupe: false });
        clear(result); result.hidden = false;
        result.append(h('div.notice.good', iconEl('check-circle'), h('span', h('b', 'Invited.'), ` Tell them to open ${location.origin}, enter ${em}, and press “Email me a magic link”. The first link creates their account; from then on they land straight on Investing.`)));
        btn.disabled = true; reload();
      } catch (e) { clear(result); result.hidden = false; result.append(h('div.error-box', `${e.code || 'error'}: ${e.message}`)); }
      return false;
    } }] });
  setTimeout(() => email.focus(), 60);
  return dlg;
}
async function revokeMember(m, reload) {
  const ok = await confirmDialog({ title: `Revoke ${m.email}?`, message: 'Their next request is refused and the Investing tab closes for them. You can reinstate later.', confirmText: 'Revoke access', danger: true });
  if (!ok) return;
  try { await call('iris2_member_revoke', { p_email: m.email }, { dedupe: false }); toast({ title: 'Member revoked', message: m.email, kind: 'success' }); reload(); }
  catch (e) { toast({ title: 'Revoke failed', message: `${e.code || 'error'}: ${e.message}`, kind: 'error', duration: 7000 }); }
}
async function reinstate(m, reload) {
  try { await call('iris2_member_set', { p_email: m.email, p_scopes: m.scopes && m.scopes.length ? m.scopes : ['investing'], p_label: m.label || null }, { dedupe: false }); toast({ title: 'Member reinstated', message: m.email, kind: 'success' }); reload(); }
  catch (e) { toast({ title: 'Could not reinstate', message: `${e.code || 'error'}: ${e.message}`, kind: 'error', duration: 7000 }); }
}
const meterVal = (v, unit, cap = false) => unit === 'USD' ? fmt.money(v, cap ? 0 : 2) : unit === 'GB' ? `${fmt.num(v, 1)} GB` : fmt.compact(v);
const rank = (s) => (s.status === 'owner' ? 0 : s.status === 'open' ? 1 : 2) * 10 + ({ critical: 0, high: 1, medium: 2, low: 3 }[s.severity] ?? 4);

function rotate(reload) {
  const label = h('input.input', { type: 'text', placeholder: 'n8n · catalyst feed', 'aria-label': 'Token label', id: 'tok-label' });
  const SCOPES = ['spend:check', 'spend:record', 'rev:write', 'brain:read', 'brain:write', 'stream:write', 'estate:write', 'markets:write', 'outbox:consume'];
  const boxes = SCOPES.map((s) => h('label.checkbox', h('input', { type: 'checkbox', value: s }), s));
  const result = h('div', { hidden: true });
  const dlg = openDialog({ title: 'Rotate · create a machine token', sub: 'The plaintext goes straight into Supabase Vault. This screen only ever shows the Vault secret name.', glow: true,
    body: h('div.stack', h('div.field', h('label', { for: 'tok-label' }, 'Label'), label), h('div.field', h('label', 'Scopes'), h('div.chips', boxes)), result),
    actions: [{ label: 'Close', class: 'btn-ghost' }, { label: 'Create token', class: 'btn-primary', icon: 'key', close: false, onClick: async (btn) => {
      const scopes = boxes.map((b) => b.firstChild).filter((c) => c.checked).map((c) => c.value);
      if (!label.value.trim()) { label.focus(); return false; }
      if (!scopes.length) { toast({ title: 'Pick at least one scope', kind: 'warn' }); return false; }
      try {
        const d = await call('iris2_token_rotate', { p_label: label.value.trim(), p_scopes: scopes }, { dedupe: false });
        clear(result); result.hidden = false;
        result.append(h('div.notice.good', iconEl('check-circle'), h('span', h('b', 'Created.'), ' Vault secret ', h('span.mono', d?.vault_secret_name || '—'), ` · id ${String(d?.id || '').slice(0, 12)} · scopes ${(d?.scopes || scopes).join(' ')}. Paste the secret into the n8n credential from the Vault UI; it is never returned here.`)));
        btn.disabled = true; reload();
      } catch (e) { clear(result); result.hidden = false; result.append(h('div.error-box', `${e.code || 'error'}: ${e.message}`)); }
      return false;
    } }] });
  setTimeout(() => label.focus(), 60);
  return dlg;
}
async function revoke(t, reload) {
  const ok = await confirmDialog({ title: `Revoke “${t.label}”?`, message: t.legacy ? 'This is the legacy board token. n8n still uses it in 69 nodes — revoke only after the rotation runbook is complete.' : 'Machines using this token stop working immediately. This cannot be undone.', confirmText: 'Revoke token', danger: true });
  if (!ok) return;
  try { await call('iris2_token_revoke', { p_id: t.id }, { dedupe: false }); toast({ title: 'Token revoked', message: t.label, kind: 'success' }); reload(); }
  catch (e) { toast({ title: 'Revoke failed', message: `${e.code || 'error'}: ${e.message}`, kind: 'error', duration: 7000 }); }
}
function runbook(s, reload) {
  openPanel({ kicker: [pill('owner action', 'status bad nodot'), h('span.muted', s.source || s.id)], title: s.title, sub: [sevPill(s.severity)],
    body: [h('div.detail-section', h('h3', 'What only you can do'), h('div.text-block', s.owner_action || 'No runbook text recorded.')),
      h('div.detail-section', h('h3', 'Suggested order'), h('div.steps', ['Create the scoped machine tokens with Rotate (one per n8n workflow family).', 'Paste each Vault secret into its n8n credential; run each workflow once in test mode.', 'Revoke the legacy token here; watch the audit log for denied calls.', 'Mark this finding fixed.'].map((t, i) => h('div', h('span.n', String(i + 1)), h('span', t)))))],
    foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => updateSecurity(s, reload) }, 'Change status'), h('button.btn.btn-primary', { type: 'button', onclick: () => setStatus(s, 'fixed', reload) }, iconEl('check'), 'Mark fixed')] });
}
async function updateSecurity(s, reload) {
  const sel = h('select.select', { 'aria-label': 'Status' }, ['open', 'owner', 'fixed'].map((v) => h('option', { value: v, selected: v === s.status ? true : null }, v === 'owner' ? 'owner action needed' : v)));
  const note = h('textarea.input', { rows: 2, placeholder: 'What changed (goes to the audit log)' });
  openDialog({ title: `Update ${s.id}`, sub: s.title, body: h('div.stack', h('div.field', h('label', 'Status'), sel), h('div.field', h('label', 'Note'), note)),
    actions: [{ label: 'Cancel', class: 'btn-ghost' }, { label: 'Save', class: 'btn-primary', onClick: async () => { await setStatus(s, sel.value, reload, note.value.trim()); return true; } }] });
}
async function setStatus(s, status, reload, note = '') {
  try { await call('iris2_security_update', { p_id: s.id, p_status: status, p_note: note }, { dedupe: false }); toast({ title: `${s.id} · ${status}`, message: s.title, kind: 'success' }); reload(); }
  catch (e) { toast({ title: 'Update failed', message: `${e.code || 'error'}: ${e.message}`, kind: 'error', duration: 7000 }); }
}

/* One honest line about whether the governor is being consulted. Three real states, not two:
   it cannot be measured at all (no reservation has ever been taken), everything was admitted, or
   some spend was not. Never asserts 0% admitted when the true answer is "unknown". */
function admissionLine(adm) {
  if (!adm || adm.measurable === false) {
    return h('div.small.muted.admission-line', adm && adm.why ? adm.why : 'Admission cannot be measured yet — no reservation has been recorded.');
  }
  const bad = Number(adm.agents_unadmitted) > 0;
  const since = adm.since ? `since ${fmt.day(adm.since)}` : '';
  const clamp = adm.clamped_to_first_reservation ? ' — the window starts at the first reservation ever taken, not 7 days ago' : '';
  return h('div.small.admission-line', { class: bad ? 'warn-ink' : 'muted' },
    bad
      ? `${fmt.int(adm.agents_unadmitted)} of ${fmt.int(adm.agents)} agents spent without calling the governor — ${fmt.money(adm.unadmitted_usd)} (${fmt.num(adm.unadmitted_pct, 1)}%) ${since}${clamp}`
      : `Every agent asked the governor before spending · ${fmt.int(adm.reservations_committed)} reservations reconciled against actuals ${since}${clamp}`);
}
