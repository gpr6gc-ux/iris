// Data layer. api.call(fn, args) → the envelope's `data`, or throws {code, message}.
// Live mode: POST /rest/v1/rpc/<fn> on Supabase PostgREST with the user's JWT as Bearer and the publishable key as apikey.
// Preview mode: the same contract served from js/fixtures (no network at all).

import { CONFIG } from './config.js';
import { S, emit } from './store.js';
import { getClient } from './auth.js';
import { FIXTURES } from './fixtures/index.js';
import { sleep } from './util.js';
import { normalize } from './normalize.js';

export class ApiError extends Error {
  constructor(code, message, extra = {}) { super(message || code); this.code = code || 'internal'; Object.assign(this, extra); }
}

const inflight = new Map();

/** Call a `public.iris2_*` function. `args` are the p_* named parameters. */
export async function call(fn, args = {}, { dedupe = true, timeoutMs = CONFIG.RPC_TIMEOUT_MS } = {}) {
  if (!/^iris2_[a-z_]+$/.test(fn)) throw new ApiError('invalid', `Refusing to call non-contract function "${fn}".`);
  if (S.preview) return callFixture(fn, args);
  const key = dedupe ? `${fn}:${JSON.stringify(args)}` : null;
  if (key && inflight.has(key)) return inflight.get(key);
  const p = callLive(fn, args, timeoutMs).finally(() => { if (key) inflight.delete(key); });
  if (key) inflight.set(key, p);
  return p;
}

async function callFixture(fn, args) {
  const fx = FIXTURES[fn];
  if (!fx) throw new ApiError('not_found', `No sample data for ${fn}.`);
  await sleep(180 + Math.random() * 220); // let skeletons be seen; keeps the preview honest about async
  const res = typeof fx === 'function' ? fx(args || {}) : fx;
  const env = res && typeof res === 'object' && 'ok' in res ? res : { ok: true, data: res };
  if (!env.ok) throw new ApiError(env.error?.code || 'internal', env.error?.message || 'Sample call failed.');
  return normalize(fn, structuredClone(env.data));
}

async function callLive(fn, args, timeoutMs) {
  const sb = getClient();
  const { data: { session } = {} } = await sb.auth.getSession();
  if (!session?.access_token) throw new ApiError('unauthenticated', 'No session. Sign in to continue.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: CONFIG.SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(args || {}),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e && e.name === 'AbortError') throw new ApiError('timeout', `${fn} took longer than ${Math.round(timeoutMs / 1000)}s.`);
    throw new ApiError('network', `Could not reach Supabase (${e && e.message ? e.message : 'network error'}).`);
  }
  clearTimeout(timer);
  let body = null;
  const text = await res.text();
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (res.status === 401 || res.status === 403) {
    const msg = (body && (body.message || body.msg)) || 'forbidden';
    emit('auth:forbidden', { fn, status: res.status, message: msg });
    throw new ApiError('forbidden', /jwt|expired|invalid/i.test(msg) ? 'Your session is no longer valid. Sign in again.' : msg, { status: res.status });
  }
  if (!res.ok) {
    // PostgREST error body: {code, message, details, hint}. A `raise 'forbidden'` from require_owner arrives as P0001 with that message.
    const pgcode = body && body.code ? String(body.code) : '';
    const msg = (body && (body.message || body.details)) || `HTTP ${res.status}`;
    if (/forbidden/i.test(msg)) { emit('auth:forbidden', { fn, status: res.status, message: msg }); throw new ApiError('forbidden', 'This account is not an owner.', { status: res.status }); }
    if (pgcode === 'PGRST202' || res.status === 404) throw new ApiError('not_found', `${fn} is not deployed yet (${pgcode || res.status}).`, { status: res.status });
    if (pgcode === '57014' || /timeout/i.test(msg)) throw new ApiError('timeout', msg, { status: res.status });
    if (pgcode === 'PGRST301' || pgcode === 'PGRST302') throw new ApiError('forbidden', msg, { status: res.status });
    throw new ApiError(res.status >= 500 ? 'internal' : 'invalid', `${msg}${body && body.hint ? ` — ${body.hint}` : ''}`, { status: res.status, pgcode });
  }
  // Envelope: {ok, data, meta} | {ok:false, error:{code,message}, meta}
  if (body && typeof body === 'object' && 'ok' in body) {
    if (body.ok === false) { const err = body.error || {}; if (err.code === 'forbidden') emit('auth:forbidden', { fn, message: err.message }); throw new ApiError(err.code || 'internal', err.message || 'The function returned an error.', { meta: body.meta }); }
    return normalize(fn, body.data);
  }
  // Tolerate a bare payload (should not happen per contract, but keep the page working).
  return normalize(fn, body);
}

export const api = { call, ApiError };
export default api;
