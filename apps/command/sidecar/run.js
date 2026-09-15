#!/usr/bin/env node
// IRIS market-stream runner. Live when IRIS_PRICE_API_KEY is set AND its entitlement verifies; otherwise a clearly
// labelled REPLAY from fixtures/watchlist-replay.ndjson so the pipeline is demonstrable with no key.
// Env: IRIS_URL, IRIS_ANON, IRIS_TOKEN (worker token), IRIS_PRICE_API_KEY (optional), IRIS_STREAM_SYMBOLS (optional csv).
'use strict';
const fs = require('fs');
const path = require('path');
const { MarketStream, ReplayClient } = require('./market-stream.js');

const WL = (process.env.IRIS_STREAM_SYMBOLS || 'SPY,QQQ,IWM,DIA,NVDA,TSLA,AAPL,AMD,META,MSFT,AMZN,GOOGL').split(',').map((s) => s.trim().toUpperCase());

(async () => {
  let provider;
  const key = process.env.IRIS_PRICE_API_KEY;
  if (key) {
    const { MassiveClient, verifyEntitlement } = require('./providers/massive.js');
    let ent;
    try { ent = await verifyEntitlement(key); } catch (e) { console.error('entitlement check failed:', e.message); }
    if (ent && ent.entitlement !== 'unknown') {
      console.log(`Massive entitlement: ${ent.entitlement} (${ent.evidence})${ent.unverified ? ' [heuristic — confirm the plan]' : ''}`);
      provider = new MassiveClient({ apiKey: key, entitlement: ent.entitlement, entitlementDelayS: ent.delayS });
    } else {
      console.error('PRICE_API_KEY did not verify (' + (ent && ent.evidence) + '); falling back to REPLAY so nothing is mislabelled LIVE.');
    }
  }
  if (!provider) {
    const lines = fs.readFileSync(path.join(__dirname, 'fixtures/watchlist-replay.ndjson'), 'utf8').split('\n').filter(Boolean);
    provider = new ReplayClient({ lines, entitlement: 'delayed-15m', entitlementDelayS: 900, loop: true, intervalMs: 800 });
    console.log('No entitled key — running REPLAY (feed state will say so; nothing is labelled LIVE).');
  }
  const ms = new MarketStream({ symbols: WL, provider, log: (...a) => console.log('[stream]', ...a) });
  process.on('SIGINT', async () => { await ms.stop(); process.exit(0); });
  process.on('SIGTERM', async () => { await ms.stop(); process.exit(0); });
  await ms.start();
})().catch((e) => { console.error(e); process.exit(1); });
