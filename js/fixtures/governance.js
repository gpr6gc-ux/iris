// iris2_governance() + iris2_token_rotate / iris2_token_revoke / iris2_security_update
import { ago, day, ok, fail, STATE } from './_state.js';

const TOKENS = [
  { id: 'tok_9a1b2c3d-0001-4a00-8000-000000000001', label: 'iris-command board', scopes: ['*'], created_at: '2026-08-21T14:02:00Z', last_used_at: ago('2m'), expires_at: null, revoked_at: null, legacy: true },
  { id: 'tok_9a1b2c3d-0001-4a00-8000-000000000002', label: 'n8n · spend governor', scopes: ['spend:check', 'spend:record'], created_at: '2026-09-01T09:10:00Z', last_used_at: ago('3m'), expires_at: '2027-03-01T00:00:00Z', revoked_at: null, legacy: false },
  { id: 'tok_9a1b2c3d-0001-4a00-8000-000000000003', label: 'n8n · revenue engine', scopes: ['rev:write'], created_at: '2026-09-03T18:40:00Z', last_used_at: ago('16m'), expires_at: '2027-03-01T00:00:00Z', revoked_at: null, legacy: false },
  { id: 'tok_9a1b2c3d-0001-4a00-8000-000000000004', label: 'mcp-claude-code', scopes: ['brain:read', 'brain:write'], created_at: '2026-09-02T11:00:00Z', last_used_at: ago('1d'), expires_at: '2026-12-01T00:00:00Z', revoked_at: null, legacy: false },
];

const SECURITY = [
  { id: 'F1', severity: 'critical', title: 'Shared token removed from the public page · owner sign-in required', status: 'fixed', owner_action: null, source: 'IRIS_COMMAND_AUDIT F1' },
  { id: 'F2', severity: 'critical', title: 'Browser → n8n webhooks removed · actions go through audited RPCs and the outbox', status: 'fixed', owner_action: null, source: 'IRIS_COMMAND_AUDIT F2' },
  { id: 'F3', severity: 'high', title: 'Money tab gated behind Auth · fin.* RPCs owner-only', status: 'fixed', owner_action: null, source: 'IRIS_COMMAND_AUDIT F3' },
  { id: 'F4', severity: 'high', title: 'Config split: iris2_config_public never returns secrets', status: 'fixed', owner_action: null, source: 'IRIS_COMMAND_AUDIT F4' },
  { id: 'B1', severity: 'high', title: 'Rotate the legacy board token (n8n uses it in 69 nodes) · new token waits in Vault', status: 'owner', owner_action: 'Run the rotation runbook: create the scoped tokens, update the 69 n8n nodes, revoke the legacy token.', source: 'IRIS_BACKEND_AUDIT B1' },
  { id: 'B2', severity: 'medium', title: 'Service-role key in n8n $vars (5 workflows) → scoped machine tokens', status: 'open', owner_action: null, source: 'IRIS_BACKEND_AUDIT B2 · phase 2' },
  { id: 'B4', severity: 'medium', title: '10 token-less RPCs (iris_search, iris_ingest…) → require scope', status: 'open', owner_action: null, source: 'IRIS_BACKEND_AUDIT B4 · phase 2' },
  { id: 'F5', severity: 'high', title: 'Polling replaced by Realtime broadcast · 23k RPC/day → <1k', status: 'fixed', owner_action: null, source: 'IRIS_COMMAND_AUDIT F5' },
  { id: 'B3', severity: 'high', title: 'Per-function statement_timeout on every RPC v2 function', status: 'fixed', owner_action: null, source: 'IRIS_BACKEND_AUDIT B3' },
  { id: 'B6', severity: 'medium', title: 'Catalyst upsert conflict target vs UNIQUE(source, headline, at)', status: 'open', owner_action: null, source: 'IRIS_BACKEND_AUDIT B6 · fix queued' },
];

export function governance() {
  const tokens = [...STATE.tokens, ...TOKENS].map((t) => ({ ...t, revoked_at: STATE.revoked.has(t.id) ? new Date().toISOString() : t.revoked_at }));
  return ok({
    spend: {
      today_usd: 3.90, week_usd: 20.37,
      caps: [
        { scope: 'anthropic', key: '24h', window_hours: 24, cap_usd: 10, spent_usd: 1.84, pct: 18.4, hard: true, note: 'daily hard cap · all agents' },
        { scope: 'anthropic', key: '1h', window_hours: 1, cap_usd: 3, spent_usd: 0.31, pct: 10.3, hard: true, note: 'burst cap' },
        { scope: 'agent:modellens-review', key: '24h', window_hours: 24, cap_usd: 4, spent_usd: 1.62, pct: 40.5, hard: false, note: 'soft · warns at 80%' },
      ],
      // reservations track ledger rows 1:1 for a governed agent; one here never asks, so the
      // "unadmitted" branch of the UI is exercised by the sample rather than only by an outage.
      by_agent: [{ agent: 'scout-craft', calls: 141, usd: 6.41, reservations: 141, admitted: true }, { agent: 'scout-signals', calls: 98, usd: 4.90, reservations: 98, admitted: true }, { agent: 'modellens-review', calls: 41, usd: 3.02, reservations: 41, admitted: true }, { agent: 'council', calls: 6, usd: 2.55, reservations: 0, admitted: false }, { agent: 'gmail-sentinel', calls: 212, usd: 1.88, reservations: 212, admitted: true }, { agent: 'revenue-engine', calls: 12, usd: 0.05, reservations: 12, admitted: true }],
      /* The clamp is part of the sample, because forgetting it is what produced a wrong 24.2%
         figure against real data: the ledger starts weeks before reservations were ever recorded. */
      admission: { measurable: true, since: new Date(Date.now() - 36 * 3600e3).toISOString(),
        clamped_to_first_reservation: true, reservations_begin: new Date(Date.now() - 36 * 3600e3).toISOString(),
        total_usd: 18.81, unadmitted_usd: 2.55, unadmitted_pct: 13.6, agents: 6, agents_unadmitted: 1,
        reservations_committed: 504, reservations_expired: 12 },
      by_model: [{ model: 'claude-sonnet-4-5', calls: 182, usd: 12.90 }, { model: 'claude-haiku-4-5', calls: 318, usd: 4.92 }, { model: 'claude-opus-4-1', calls: 6, usd: 2.55 }],
      denials: [],
      governed_workflows: 11, total_llm_workflows: 26,
    },
    meters: [
      { name: 'anthropic_24h', label: 'Anthropic · 24h', value: 1.84, cap: 10, unit: 'USD', pct: 18.4, source: 'ops.llm_ledger', updated_at: ago('2m'), detail: 'hard cap' },
      { name: 'n8n_exec_month', label: 'n8n executions · month', value: 70500, cap: 50000, unit: 'executions', pct: 141, source: 'n8n api', updated_at: ago('1h'), detail: '≈ 2,350 / day · over quota at this rate' },
      { name: 'db_size', label: 'Database size', value: 1.9, cap: 8, unit: 'GB', pct: 23.8, source: 'pg_database_size', updated_at: ago('6h'), detail: 're 904 MB · karta 210 MB' },
      { name: 'realtime_msgs', label: 'Realtime messages · day', value: 6120, cap: 2000000, unit: 'messages', pct: 0.3, source: 'supabase usage', updated_at: ago('1h'), detail: 'broadcast iris:stream' },
    ],
    gates: {
      green: 17, total: 17,
      rows: ['auth.owner_allowlist', 'rpc.v2.grants_authenticated_only', 'rpc.v2.statement_timeout', 'audit_log.append_only', 'outbox.no_browser_webhooks', 'rev.channels.default_off', 'spend.caps.hard', 'realtime.private_channel', 'tokens.scoped', 'vault.secrets_only', 'rls.re', 'rls.karta', 'rls.brain', 'rls.ops', 'n8n.error_workflow', 'backups.daily', 'csp.strict'].map((gate, i) => ({ gate, state: 'green', detail: 'passing', checked_at: ago(`${5 + i * 3}m`) })),
    },
    tokens,
    audit: [
      { at: ago('8m'), actor_kind: 'owner', actor_id: 'greyson', action: 'proposal.approve', object_type: 'brain.proposals', object_id: '6f1c2a9e' },
      { at: ago('14m'), actor_kind: 'machine', actor_id: 'revenue-engine', action: 'rev.content_in ×3', object_type: 'rev.content_items', object_id: 'cnt_01..03' },
      { at: ago('41m'), actor_kind: 'machine', actor_id: 'modellens', action: 'efficiency_run.record', object_type: 'karta.efficiency_runs', object_id: 'd4a7c3f5' },
      { at: ago('3.3h'), actor_kind: 'cron', actor_id: 'spend-governor', action: 'cap.evaluate', object_type: 'ops.spend_caps', object_id: 'anthropic/24h' },
      { at: ago('5h'), actor_kind: 'machine', actor_id: 'modellens', action: 'efficiency_run.record', object_type: 'karta.efficiency_runs', object_id: 'a1d4f0c2' },
      { at: ago('9h'), actor_kind: 'owner', actor_id: 'greyson', action: 'claim.accept ×4', object_type: 'brain.claims', object_id: 'bulk' },
      { at: ago('1d'), actor_kind: 'owner', actor_id: 'greyson', action: 'token.create', object_type: 'brain.app_tokens_v2', object_id: 'n8n · revenue engine' },
      { at: ago('1d'), actor_kind: 'machine', actor_id: 'executor', action: 'proposal.execute', object_type: 'ops.outbox', object_id: 'obx_44a1' },
    ],
    security: SECURITY.map((s) => ({ ...s, status: STATE.security[s.id] || s.status })),
    n8n: { executions_per_day: 2350, quota_month: 50000, failing: [{ workflow: 'Catalyst Feed', id: 'wf_7Hk2QpL', last_error: 'iris_inv_catalyst_upsert: there is no unique or exclusion constraint matching the ON CONFLICT specification', since: day(-2) }] },
  });
}

export function tokenRotate(args = {}) {
  const label = String(args.p_label || '').trim(); const scopes = Array.isArray(args.p_scopes) ? args.p_scopes : [];
  if (!label) return fail('invalid', 'p_label is required');
  if (!scopes.length) return fail('invalid', 'at least one scope is required');
  const id = `tok_${Math.random().toString(16).slice(2, 10)}-0001-4a00-8000-${Date.now().toString(16).padStart(12, '0')}`;
  const vault_secret_name = `iris_token_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}_${day(0).replace(/-/g, '')}`;
  STATE.tokens.unshift({ id, label, scopes, created_at: new Date().toISOString(), last_used_at: null, expires_at: day(180) + 'T00:00:00Z', revoked_at: null, legacy: false });
  return ok({ id, label, scopes, vault_secret_name, created_at: new Date().toISOString(), note: 'plaintext stored in Supabase Vault only — never returned' });
}
export function tokenRevoke(args = {}) {
  const all = [...STATE.tokens, ...TOKENS];
  if (!all.some((t) => t.id === args.p_id)) return fail('not_found', 'token not found');
  STATE.revoked.add(args.p_id);
  return ok({ id: args.p_id, revoked_at: new Date().toISOString() });
}
export function securityUpdate(args = {}) {
  if (!SECURITY.some((s) => s.id === args.p_id)) return fail('not_found', 'finding not found');
  if (!['fixed', 'open', 'owner'].includes(args.p_status)) return fail('invalid', 'status must be fixed|open|owner');
  STATE.security[args.p_id] = args.p_status;
  return ok({ id: args.p_id, status: args.p_status, note: args.p_note || '', updated_at: new Date().toISOString() });
}


// ---- members (iris2_members / iris2_member_set / iris2_member_revoke)
const MEMBERS = [
  { email: 'newguy@example.com', scopes: ['investing'], label: 'Discord · new contributor', invited_by: 'greyson@mccourtai.com', created_at: ago('2h'), revoked_at: null, first_seen_at: null, last_seen_at: null, status: 'invited' },
];
STATE.members = STATE.members || MEMBERS.map((m) => ({ ...m }));
export function members() { return ok({ members: STATE.members.slice(), scopes_available: ['investing'] }); }
export function memberSet({ p_email, p_scopes, p_label }) {
  const email = String(p_email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('invalid', 'that is not an email address');
  let m = STATE.members.find((x) => x.email === email);
  if (!m) { m = { email, scopes: p_scopes || ['investing'], label: p_label || null, invited_by: 'greyson@mccourtai.com', created_at: new Date().toISOString(), revoked_at: null, first_seen_at: null, last_seen_at: null, status: 'invited' }; STATE.members.unshift(m); }
  else { m.scopes = p_scopes || m.scopes; m.label = p_label || m.label; m.revoked_at = null; m.status = m.first_seen_at ? 'active' : 'invited'; }
  return ok({ ...m });
}
export function memberRevoke({ p_email }) {
  const m = STATE.members.find((x) => x.email === String(p_email || '').trim().toLowerCase());
  if (!m) return fail('not_found', 'no such member');
  m.revoked_at = new Date().toISOString(); m.status = 'revoked';
  return ok({ email: m.email, revoked_at: m.revoked_at });
}
export function me() { return ok({ role: 'owner', email: 'greyson@mccourtai.com', scopes: ['*'] }); }
