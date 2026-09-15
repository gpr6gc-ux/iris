// End-to-end: the runner's ReplayClient → MarketStream → captured RPCs. Confirms the fixture drives real upserts
// with coalescing, and that a replay run never emits a LIVE state and always flags itself as replay.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { MarketStream, ReplayClient } = require('../market-stream.js');

test('replay fixture flows through to batched upserts, never LIVE, always flagged replay', async () => {
  const lines = fs.readFileSync(path.join(__dirname, '../fixtures/watchlist-replay.ndjson'), 'utf8').split('\n').filter(Boolean);
  const calls = { upsert: [], feed: [] };
  const post = async (url, body) => {
    if (url.endsWith('quotes_upsert')) { calls.upsert.push(body.p_rows); return { ok: true, rows: body.p_rows.length }; }
    calls.feed.push(body.p_state); return { ok: true };
  };
  const ms = new MarketStream({
    symbols: ['SPY', 'QQQ', 'IWM', 'DIA', 'NVDA', 'TSLA', 'AAPL', 'AMD', 'META', 'MSFT', 'AMZN', 'GOOGL'],
    token: 't', anonKey: 'k', post, flushMs: 30, heartbeatMs: 40,
    provider: new ReplayClient({ lines, entitlement: 'delayed-15m', entitlementDelayS: 900, intervalMs: 2 }),
  });
  await ms.start();
  await new Promise((r) => setTimeout(r, 200));
  await ms.stop();
  const all = calls.upsert.flat();
  assert.ok(all.length >= 3, `got ${all.length} rows`);
  const symbols = new Set(all.map((r) => r.symbol));
  assert.ok(symbols.has('SPY') && symbols.has('QQQ') && symbols.has('NVDA'));
  assert.ok(all.every((r) => r.state !== 'LIVE'), 'replay never LIVE');
  assert.ok(all.every((r) => r.quality_flags.includes('replay')), 'every replay row flagged');
  const spy = all.filter((r) => r.symbol === 'SPY').at(-1);
  assert.equal(spy.last, 760.35, 'newest SPY last from the fixture');
  assert.ok(calls.feed.some((f) => /REPLAY/.test(f.note || '')), 'feed_state discloses replay');
});
