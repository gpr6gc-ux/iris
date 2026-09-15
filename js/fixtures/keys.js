// iris2_vault / iris2_vault_set_readable / iris2_secret_set / iris2_secret_clear — the Vault page.
// Preview never holds real secrets; toggles + set/clear mutate in-memory state so the flow is demonstrable.
import { ok, STATE } from './_state.js';

const CATALOG = [
  { key_name: 'PRICE_API_KEY', purpose: 'Massive stock price feed', domain: 'markets', kind: 'api_key', required: true, unblocks: 'daily prices + sector rotation', present: true, value_len: 32, worker_readable: true, verify_status: 'ok', verified_at: '2026-09-09T01:20:00Z', set_via: 'command_center' },
  { key_name: 'RENTCAST_API_KEY', purpose: 'RentCast for-sale listing feed', domain: 'real_estate', kind: 'api_key', required: false, unblocks: 'Estate cashflow rental finder', present: true, value_len: 32, worker_readable: true, verify_status: 'ok', verified_at: '2026-09-09T01:20:00Z', set_via: 'command_center' },
  { key_name: 'CENSUS_KEY', purpose: 'US Census enrichment', domain: 'estate', kind: 'api_key', required: false, unblocks: 'demographic enrichment on RE deals', present: true, value_len: 40, worker_readable: true, verify_status: 'ok', verified_at: '2026-09-09T01:20:00Z', set_via: 'command_center' },
  { key_name: 'HUD_TOKEN', purpose: 'HUD fair-market-rent data', domain: 'estate', kind: 'api_key', required: false, unblocks: 'HUD FMR + program data', present: false, value_len: 0, worker_readable: true, verify_status: 'unknown', verified_at: null, set_via: 'n8n variable' },
  { key_name: 'OPENAI_API_KEY', purpose: 'Embeddings for memory search', domain: 'memory', kind: 'api_key', required: false, unblocks: 'semantic recall in Memory Ask', present: false, value_len: 0, worker_readable: true, verify_status: 'unknown', verified_at: null, set_via: 'n8n variable' },
  { key_name: 'DISCORD_BOT_TOKEN', purpose: 'Discord bot token (GreysonAI)', domain: 'discord', kind: 'api_key', required: false, unblocks: 'Discord intake + comms loop', present: true, value_len: 72, worker_readable: false, verify_status: 'ok', verified_at: '2026-09-09T01:20:00Z', set_via: 'command_center' },
  { key_name: 'DISCORD_CHANNEL_ID', purpose: 'Discord intake channel ID', domain: 'discord', kind: 'api_key', required: false, unblocks: 'Discord intake', present: true, value_len: 19, worker_readable: false, verify_status: 'unverifiable', verified_at: null, set_via: 'command_center' },
  { key_name: 'SIMPLEFIN_ACCESS_URL', purpose: 'SimpleFIN finance sync', domain: 'finance', kind: 'api_key', required: false, unblocks: 'live bank/brokerage sync', present: false, value_len: 0, worker_readable: false, verify_status: 'unknown', verified_at: null, set_via: 'n8n variable' },
  { key_name: 'Anthropic (n8n credential)', purpose: 'LLM layer for agents/scouts', domain: 'system', kind: 'credential', required: true, unblocks: 'all agent + scout model calls', present: true, value_len: 0, worker_readable: false, verify_status: 'ok', verified_at: '2026-09-09T01:20:00Z', set_via: 'n8n credential' },
  { key_name: 'board token (iris-command)', purpose: 'Write token every feed writer presents', domain: 'system', kind: 'token', required: true, unblocks: 'all feed writes', present: true, value_len: 0, worker_readable: false, verify_status: 'ok', verified_at: '2026-09-09T01:20:00Z', set_via: 'brain.app_tokens' },
  { key_name: 'SUPABASE service_role', purpose: 'Server-side DB writes from n8n', domain: 'system', kind: 'token', required: true, unblocks: 'nightly writers', present: true, value_len: 0, worker_readable: false, verify_status: 'ok', verified_at: '2026-09-09T01:20:00Z', set_via: 'n8n variable' },
];

const state = () => { if (!STATE.vault) STATE.vault = {}; return STATE.vault; };

function items() {
  const st = state();
  return CATALOG.map((c) => {
    const p = st[c.key_name] || {};
    return { ...c,
      present: p.present != null ? p.present : c.present,
      value_len: p.value_len != null ? p.value_len : c.value_len,
      worker_readable: p.worker_readable != null ? p.worker_readable : c.worker_readable };
  });
}

export function vault() {
  const list = items();
  return ok({
    items: list,
    summary: {
      total: list.length,
      present: list.filter((s) => s.present).length,
      verified_ok: list.filter((s) => s.verify_status === 'ok').length,
      failing: list.filter((s) => s.verify_status === 'failing').length,
      missing_required: list.filter((s) => s.required && !s.present).length,
    },
  });
}

export function vaultSetReadable(a = {}) {
  const st = state(); const prev = st[a.p_key_name] || {};
  st[a.p_key_name] = { ...prev, worker_readable: !!a.p_readable };
  return ok({ key_name: a.p_key_name, worker_readable: !!a.p_readable });
}

export function secretSet(a = {}) {
  const st = state(); const v = String(a.p_value || '');
  st[a.p_key_name] = { ...(st[a.p_key_name] || {}), present: true, value_len: v.length };
  return ok({ key_name: a.p_key_name, present: true, value_len: v.length });
}
export function secretClear(a = {}) {
  const st = state();
  st[a.p_key_name] = { ...(st[a.p_key_name] || {}), present: false, value_len: 0 };
  return ok({ key_name: a.p_key_name, present: false });
}
