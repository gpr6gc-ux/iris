// IRIS — Daily Price Feed · "Summarize Load" Code node (runOnceForAllItems)
// Input: one item per 3,000-row chunk from "Upsert Prices" (PostgREST reply {ok, rows} or an error body).
// Pairs each reply with its chunk from "Load Missing Sessions" by position and emits ONE item per session:
//   { d, loaded, offered, chunks, degraded, key_error, pending, reason, upsert_errors[], ok }
// or a single { nothing_to_do: true } item when every session in the window was already loaded.
const chunks = $('Load Missing Sessions').all();
const replies = $input.all();
const bySession = {};
for (let i = 0; i < chunks.length; i++) {
  const c = chunks[i].json || {};
  const u = (replies[i] && replies[i].json) || {};
  if (c.nothing_to_do) {
    bySession.__none__ = { nothing_to_do: true, missing_total: c.missing_total || 0, last_completed_session: c.last_completed_session || null, ok: false, d: null };
    continue;
  }
  const key = String(c.d || 'unknown');
  const s = bySession[key] || (bySession[key] = { d: c.d || null, loaded: 0, offered: c.n || 0, chunks: 0, degraded: false, key_error: false, pending: false, reason: null, upsert_errors: [], nothing_to_do: false });
  s.chunks += 1;
  s.loaded += Number(u.rows || 0);
  if (c.degraded) { s.degraded = true; s.key_error = s.key_error || !!c.key_error; s.pending = s.pending || !!c.pending; s.reason = c.reason || s.reason; }
  if (!c.degraded && (u.code || (u.message && u.rows === undefined))) s.upsert_errors.push(String(u.message || u.code));
}
return Object.values(bySession).map((s) => ({ json: Object.assign(s, {
  ok: !s.nothing_to_do && !s.degraded && s.loaded > 0 && s.upsert_errors.length === 0,
  reason: s.reason || (s.upsert_errors.length ? ('upsert failed: ' + s.upsert_errors.join(' | ')) : null),
}) }));
