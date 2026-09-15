// IRIS — Daily Price Feed · "Load Missing Sessions" Code node (n8n, runOnceForAllItems)
// Source of truth for the node's jsCode; the n8n copy is this file with SB_KEY/TOKEN filled from the instance.
//
// What it does, in order:
//   1. asks the database which sessions in the last 260 are missing (< 1,000 bars) — newest first, at most 4;
//   2. drops any session dated today (America/New_York): the provider serves a session only after its end of day;
//   3. fetches the API key from the IRIS vault INSIDE this node (it is never emitted as item data);
//   4. requests Massive grouped-daily for each session, 13 s apart (free plan: 5 calls/minute);
//   5. emits 3,000-row chunks per session for the upsert node, or one degraded item per session that failed,
//      with the provider's own status/message verbatim.
// Nothing here estimates or fills; a session with no rows is reported as such.

const SB = 'https://ssuikijiaulfhfxzwrgu.supabase.co/rest/v1/rpc/';
const SB_KEY = '<<SUPABASE_PUBLISHABLE_KEY>>';          // public key (sb_publishable_...), also in js/config.js
const TOKEN = '<<IRIS_TOKEN>>';                          // low-privilege worker token
const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };
const self = this;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD

let plan;
try {
  plan = await self.helpers.httpRequest({ method: 'POST', url: SB + 'iris_price_sessions_missing', headers: H,
    body: { p_token: TOKEN, p_lookback_sessions: 260, p_limit: 4, p_min_bars: 1000 }, json: true, timeout: 30000 });
} catch (e) {
  return [{ json: { d: null, chunk: [], idx: 0, total: 0, n: 0, degraded: true, key_error: false, pending: false,
    reason: 'iris_price_sessions_missing failed: ' + String(e && e.message || e), nothing_to_do: false } }];
}
const sessions = ((plan && plan.sessions) || []).map((s) => s.d).filter((d) => d < todayET);
if (!sessions.length) {
  return [{ json: { d: null, chunk: [], idx: 0, total: 0, n: 0, degraded: false, key_error: false, pending: false,
    reason: null, nothing_to_do: true, missing_total: plan && plan.missing_total, last_completed_session: plan && plan.last_completed_session } }];
}

let key = '';
try {
  const r = await self.helpers.httpRequest({ method: 'POST', url: SB + 'iris_secret_get', headers: H,
    body: { p_token: TOKEN, p_name: 'PRICE_API_KEY', p_source: 'price-feed' }, json: true, timeout: 15000 });
  key = (typeof r === 'string') ? r : (r && r.value ? r.value : '');
} catch (e) { key = ''; }
if (!key) {
  return sessions.map((d) => ({ json: { d, chunk: [], idx: 0, total: 0, n: 0, degraded: true, key_error: true, pending: false,
    reason: 'PRICE_API_KEY is not set in the IRIS vault; no request was made for ' + d, nothing_to_do: false } }));
}

const out = [];
for (let i = 0; i < sessions.length; i++) {
  const d = sessions[i];
  if (i > 0) await sleep(13000);
  let r;
  try {
    r = await self.helpers.httpRequest({ method: 'GET',
      url: 'https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/' + d,
      qs: { adjusted: 'true', apiKey: key }, json: true, timeout: 90000, ignoreHttpStatusErrors: true });
  } catch (e) {
    out.push({ json: { d, chunk: [], idx: 0, total: 0, n: 0, degraded: true, key_error: false, pending: false,
      reason: 'grouped-daily request failed for ' + d + ': ' + String(e && e.message || e), nothing_to_do: false } });
    continue;
  }
  const st = String((r && r.status) || '');
  const msg = String((r && (r.message || r.error)) || '');
  const res = (r && r.results) || [];
  if (!res.length) {
    const up = (st + ' ' + msg).toUpperCase();
    const keyProblem = st.toUpperCase() === 'ERROR' || up.indexOf('UNKNOWN API KEY') >= 0 || up.indexOf('NOT ENTITLED') >= 0 || up.indexOf('UNAUTHORIZED') >= 0;
    const notYet = up.indexOf('BEFORE END OF DAY') >= 0 || up.indexOf('NOT_AUTHORIZED') >= 0 && up.indexOf('TODAY') >= 0;
    let reason;
    if (notYet) reason = 'Provider has not published ' + d + ' yet (status=' + st + ', message=' + (msg || 'none') + '); will retry next run.';
    else if (keyProblem) reason = 'PRICE_API_KEY rejected by Massive (status=' + st + ', message=' + (msg || 'none') + '). No prices were loaded for ' + d + '.';
    else if (st.toUpperCase() === 'OK' || st.toUpperCase() === 'DELAYED') reason = 'Grouped daily answered ' + st + ' with zero results for ' + d + ' (a session in the exchange calendar). Unverified cause; will retry next run.';
    else reason = 'Grouped daily returned no rows for ' + d + ' (status=' + st + ', message=' + (msg || 'none') + ').';
    out.push({ json: { d, chunk: [], idx: 0, total: 0, n: 0, degraded: true, key_error: keyProblem && !notYet, pending: notYet, reason, nothing_to_do: false } });
    continue;
  }
  const rows = [];
  for (const x of res) {
    if (!x || !x.T || x.c === undefined || x.c === null) continue;
    rows.push({ ticker: String(x.T).toUpperCase(), d, close: x.c, volume: (x.v === undefined || x.v === null) ? null : Math.round(x.v), source: 'massive:grouped-daily' });
  }
  const size = 3000, total = Math.ceil(rows.length / size);
  for (let c = 0; c < total; c++) {
    out.push({ json: { d, chunk: rows.slice(c * size, (c + 1) * size), idx: c, total, n: rows.length, degraded: false, key_error: false, pending: false, reason: null, nothing_to_do: false,
      provider_status: st, resultsCount: r.resultsCount || res.length, queryCount: r.queryCount || null } });
  }
  if (!total) out.push({ json: { d, chunk: [], idx: 0, total: 0, n: 0, degraded: true, key_error: false, pending: false, reason: 'Response had results but none carried a ticker and close price for ' + d, nothing_to_do: false } });
}
return out;
