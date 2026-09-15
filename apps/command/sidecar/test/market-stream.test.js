// node --test  (no dependencies). Exercises the streaming pipeline with an injected post() and a ReplayClient.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { MarketStream, ReplayClient, quantile } = require('../market-stream.js');

function harness(lines, provider) {
  const calls = { upsert: [], feed: [] };
  const post = async (url, body) => {
    if (url.endsWith('iris_md_quotes_upsert')) { calls.upsert.push(body.p_rows); return { ok: true, rows: body.p_rows.length }; }
    if (url.endsWith('iris_md_feed_state')) { calls.feed.push(body.p_state); return { ok: true }; }
    return {};
  };
  let clock = Date.parse('2026-09-15T13:00:00Z');
  const now = () => clock;
  const ms = new MarketStream({
    symbols: ['SPY', 'QQQ'], token: 't', anonKey: 'k', post, now, flushMs: 999999, heartbeatMs: 999999,
    provider: provider || new ReplayClient({ lines, entitlement: 'delayed-15m', entitlementDelayS: 900 }),
  });
  return { ms, calls, tick: (d) => (clock += d) };
}

test('coalesces to the newest quote per symbol in one flush', async () => {
  const { ms, calls } = harness([
    { symbol: 'SPY', last: 650.0, seq: 1, event_time: '2026-09-15T12:59:58Z' },
    { symbol: 'SPY', last: 650.5, seq: 2, event_time: '2026-09-15T12:59:59Z' },
    { symbol: 'QQQ', last: 580.1, seq: 1, event_time: '2026-09-15T12:59:59Z' },
    { symbol: 'SPY', bid: 650.4, ask: 650.6, seq: 3, event_time: '2026-09-15T13:00:00Z' },
  ]);
  for (const m of [...ms.provider.lines]) ms.onMessage(m);
  await ms.flush();
  assert.equal(calls.upsert.length, 1, 'one batch');
  const rows = calls.upsert[0];
  assert.equal(rows.length, 2, 'one row per symbol, not per tick');
  const spy = rows.find((r) => r.symbol === 'SPY');
  assert.equal(spy.last, 650.5, 'newest last kept');
  assert.equal(spy.bid, 650.4, 'quote fields merged into the coalesced row');
  assert.equal(spy.state, 'DISCONNECTED', 'not connected yet → no LIVE/DELAYED asserted');
});

test('a delayed entitlement never emits LIVE; connected → DELAYED', async () => {
  const { ms } = harness([{ symbol: 'SPY', last: 1, seq: 1, event_time: '2026-09-15T13:00:00Z' }]);
  ms.connected = true;
  ms.onMessage(ms.provider.lines[0]);
  const row = ms.buffer.get('SPY');
  assert.equal(row.state, 'DELAYED');
  assert.equal(row.entitlement_delay_s, 900);
  assert.deepEqual(row.quality_flags, ['replay']);
});

test('a real-time entitlement emits LIVE only while connected', async () => {
  const { ms } = harness([{ symbol: 'SPY', last: 1, seq: 1, event_time: '2026-09-15T13:00:00Z' }],
    new ReplayClient({ lines: [{ symbol: 'SPY', last: 1, seq: 1, event_time: '2026-09-15T13:00:00Z' }], entitlement: 'real-time', entitlementDelayS: 0 }));
  ms.connected = true;
  ms.onMessage(ms.provider.lines[0]);
  assert.equal(ms.buffer.get('SPY').state, 'LIVE');
  ms.connected = false;
  ms.buffer.clear();
  ms.onMessage({ symbol: 'SPY', last: 2, seq: 2, event_time: '2026-09-15T13:00:01Z' });
  assert.equal(ms.buffer.get('SPY').state, 'DISCONNECTED', 'a closed socket cannot be LIVE');
});

test('duplicate and out-of-order sequences are dropped; gaps are counted', async () => {
  const { ms } = harness([]);
  ms.connected = true;
  ms.onMessage({ symbol: 'SPY', last: 1, seq: 5, event_time: '2026-09-15T13:00:00Z' });
  ms.onMessage({ symbol: 'SPY', last: 2, seq: 5, event_time: '2026-09-15T13:00:01Z' }); // duplicate
  ms.onMessage({ symbol: 'SPY', last: 3, seq: 4, event_time: '2026-09-15T13:00:02Z' }); // out of order
  assert.equal(ms.buffer.get('SPY').last, 1, 'duplicate and out-of-order did not overwrite');
  assert.equal(ms.stats.dropped_dupes, 2);
  ms.onMessage({ symbol: 'SPY', last: 9, seq: 9, event_time: '2026-09-15T13:00:03Z' }); // gap 5→9
  assert.equal(ms.stats.gaps, 1, 'a sequence jump is a gap');
  assert.equal(ms.buffer.get('SPY').last, 9);
});

test('a halted message carries HALTED state', async () => {
  const { ms } = harness([]);
  ms.connected = true;
  ms.onMessage({ symbol: 'SPY', last: 1, seq: 1, halted: true, event_time: '2026-09-15T13:00:00Z' });
  const r = ms.buffer.get('SPY');
  assert.equal(r.state, 'HALTED');
  assert.ok(r.quality_flags.includes('halted'));
});

test('non-watchlist symbols are ignored', async () => {
  const { ms } = harness([]);
  ms.connected = true;
  ms.onMessage({ symbol: 'ZZZZ', last: 1, seq: 1, event_time: '2026-09-15T13:00:00Z' });
  assert.equal(ms.buffer.size, 0);
});

test('flush failure returns rows to the buffer (nothing silently lost)', async () => {
  let fail = true;
  const post = async (url, body) => { if (url.endsWith('quotes_upsert')) { if (fail) throw new Error('502'); return { ok: true, rows: body.p_rows.length }; } return { ok: true }; };
  const ms = new MarketStream({ symbols: ['SPY'], token: 't', anonKey: 'k', post, provider: new ReplayClient({ lines: [] }) });
  ms.connected = true;
  ms.onMessage({ symbol: 'SPY', last: 1, seq: 1, event_time: '2026-09-15T13:00:00Z' });
  await assert.rejects(() => ms.flush());
  assert.equal(ms.buffer.size, 1, 'row is back in the buffer after a failed flush');
  fail = false;
  const res = await ms.flush();
  assert.equal(res.rows, 1, 'retried successfully');
  assert.equal(ms.buffer.size, 0);
});

test('heartbeat reports measured lag percentiles and connection state', async () => {
  const { ms, calls } = harness([]);
  ms.connected = true;
  // three messages with known event→receive lags of 100/200/300 ms
  let base = Date.parse('2026-09-15T13:00:00Z');
  ms.now = () => base + 100; ms.onMessage({ symbol: 'SPY', seq: 1, last: 1, event_time: base });
  ms.now = () => base + 200; ms.onMessage({ symbol: 'QQQ', seq: 1, last: 1, event_time: base });
  ms.now = () => base + 300; ms.onMessage({ symbol: 'SPY', seq: 2, last: 1, event_time: base });
  await ms.heartbeat();
  const hb = calls.feed.at(-1);
  assert.equal(hb.connected, true);
  assert.equal(hb.state, 'DELAYED');
  assert.ok(hb.p95_lag_ms >= hb.p50_lag_ms, 'p95 >= p50');
  assert.ok(hb.p50_lag_ms >= 100 && hb.p99_lag_ms <= 300, `percentiles in range: ${hb.p50_lag_ms}/${hb.p99_lag_ms}`);
});

test('reconnect: connectLoop resubscribes and backs off, then stops cleanly', async () => {
  let connects = 0, subs = 0;
  const provider = {
    name: 'flaky', dataset: 'd', replay: false, entitlement: 'delayed-15m', entitlementDelayS: 900,
    async connect() { connects++; if (connects === 1) throw new Error('refused'); },
    async subscribe() { subs++; },
    async *messages() { yield { symbol: 'SPY', last: 1, seq: 1, event_time: '2026-09-15T13:00:00Z' }; }, // then returns → socket closed
    async close() {},
  };
  const posts = [];
  const ms = new MarketStream({ symbols: ['SPY'], token: 't', anonKey: 'k', provider, flushMs: 999999, heartbeatMs: 999999,
    post: async (u, b) => { posts.push(u); return { ok: true, rows: (b.p_rows || []).length }; }, log: () => {} });
  ms.o.maxBackoffMs = 5; // keep the test fast
  const run = ms.connectLoop();
  await sleep(60);
  ms.stopped = true;
  await run;
  assert.ok(connects >= 2, 'retried after the first refusal');
  assert.ok(subs >= 1, 'resubscribed after connecting');
});

test('quantile helper', () => {
  assert.equal(quantile([10, 20, 30, 40].sort((a, b) => a - b), 0.5), 25);
  assert.equal(quantile([], 0.5), null);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
