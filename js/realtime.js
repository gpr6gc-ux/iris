// Live thinking stream: Supabase Realtime broadcast on the private channel `iris:stream` (event "event"),
// with automatic fallback to polling iris2_stream every 30 s on CHANNEL_ERROR / TIMED_OUT / CLOSED.
// In preview mode a fixture generator emits a synthetic event every ~9 s so the page feels alive without any network.

import { CONFIG } from './config.js';
import { S, setRealtime } from './store.js';
import { getClient } from './auth.js';
import { call } from './api.js';
import { previewStreamTick } from './fixtures/stream.js';

let channel = null; let pollTimer = null; let previewTimer = null; let lastAfter = null; let polling = false;
let seen = new Set();               // A12: dedupe by event id across broadcast + poll + overlap
const subs = new Set();

/** subscribe(fn) → unsubscribe. fn receives an array of new events (oldest first). */
export function subscribeStream(fn) {
  subs.add(fn);
  start();
  return () => { subs.delete(fn); if (!subs.size) stop(); };
}
export const streamState = () => S.realtime;

function deliver(events) {
  if (!events || !events.length) return;
  // A12: drop anything we've already delivered (broadcast + poll can overlap; timestamp ties are common).
  const fresh = [];
  for (const e of events) {
    const key = e.id ?? `${e.at}-${e.agent}`;
    if (seen.has(key)) continue;
    seen.add(key); fresh.push(e);
  }
  if (!fresh.length) return;
  if (seen.size > 800) seen = new Set(Array.from(seen).slice(-400)); // bound memory
  // advance the cursor to the max timestamp seen (not merely the last element)
  let maxAt = lastAfter;
  for (const e of fresh) if (e.at && (!maxAt || String(e.at) > String(maxAt))) maxAt = e.at;
  if (maxAt) lastAfter = maxAt;
  setRealtime({ last_at: lastAfter || new Date().toISOString() });
  for (const fn of subs) { try { fn(fresh); } catch (e) { console.error(e); } }
}

function start() {
  if (S.preview) { startPreview(); return; }
  if (channel || pollTimer) return;
  connectRealtime();
}

function connectRealtime() {
  let sb;
  try { sb = getClient(); } catch (e) { startPolling('no client'); return; }
  setRealtime({ state: 'connecting', mode: 'realtime' });
  const topic = (S.config && S.config.realtime_channel) || CONFIG.REALTIME_CHANNEL;
  try {
    const ch = sb.channel(topic, { config: { broadcast: { self: false }, private: true } });
    channel = ch;
    ch.on('broadcast', { event: 'event' }, (msg) => {
      const row = msg && (msg.payload || msg);
      if (row) deliver([normalizeRow(row)]);
    });
    ch.subscribe((status, err) => {
      if (channel !== ch) return; // callback for a channel we already tore down (unsubscribe re-enters synchronously)
      if (status === 'SUBSCRIBED') { setRealtime({ state: 'live', mode: 'realtime' }); stopPolling(); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        if (err) console.warn('realtime', status, err.message || err);
        teardownChannel();
        startPolling(status);
      }
    });
  } catch (e) {
    console.warn('realtime subscribe failed', e);
    teardownChannel();
    startPolling('exception');
  }
}

function teardownChannel() {
  const ch = channel; channel = null; // clear first: removeChannel() re-enters the subscribe callback synchronously
  if (ch) { try { getClient().removeChannel(ch); } catch { /* ignore */ } }
}

function startPolling(reason) {
  if (pollTimer) return;
  setRealtime({ state: 'polling', mode: 'polling', reason });
  const tick = async () => {
    if (polling) return;              // A12: never let two polls overlap
    polling = true;
    try {
      const d = await call('iris2_stream', { p_after: lastAfter, p_limit: 60 }, { dedupe: false });
      const evs = (d && d.events) || [];
      // sort by (at,id) for a stable order before dedupe/delivery
      deliver(evs.slice().sort((a, b) => String(a.at).localeCompare(String(b.at)) || String(a.id).localeCompare(String(b.id))));
      if (d && d.next_after && String(d.next_after) > String(lastAfter || '')) lastAfter = d.next_after;
      setRealtime({ state: 'polling' });
    } catch (e) { setRealtime({ state: 'error', error: e.message || String(e) }); }
    finally { polling = false; }
  };
  tick();
  pollTimer = setInterval(tick, CONFIG.STREAM_POLL_MS);
}
function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

function startPreview() {
  if (previewTimer) return;
  setRealtime({ state: 'live', mode: 'sample' });
  previewTimer = setInterval(() => { const ev = previewStreamTick(); if (ev) deliver([ev]); }, 9000);
}

function stop() {
  teardownChannel(); stopPolling();
  if (previewTimer) { clearInterval(previewTimer); previewTimer = null; }
  lastAfter = null; seen.clear(); polling = false;   // A12: reset cursor/dedupe so a new user/env starts clean
  setRealtime({ state: 'idle', mode: 'off' });
}

/** Retry realtime after a polling fallback (used by the sidebar status row). */
export function reconnectStream() { if (S.preview || !subs.size) return; teardownChannel(); stopPolling(); connectRealtime(); }

function normalizeRow(r) {
  return {
    id: r.id ?? `${r.at || Date.now()}-${r.agent || ''}`, at: r.at || r.created_at || new Date().toISOString(), agent: r.agent || r.agent_slug || 'unknown',
    session_ref: r.session_ref || r.session || '', phase: r.phase || '', event: r.event || r.title || '', detail: r.detail || '', tool: r.tool || '',
    tokens_in: r.tokens_in ?? null, tokens_out: r.tokens_out ?? null, cost_usd: r.cost_usd ?? null, model: r.model || '', ms: r.ms ?? null,
    kind: r.kind || (r.tool ? 'tool' : r.model ? 'llm' : 'info'),
  };
}

/** Set the seed cursor so polling starts after the newest event the page already has. */
export function primeStreamCursor(iso) { if (iso) lastAfter = iso; }
