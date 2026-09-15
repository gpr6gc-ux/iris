import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPrint, reconcile, aggregateFlow, putSkew25d, gexSign } from './flow.mjs';

const base = { ref_id: 'r1', seq: 1, ts: 1000, quote_ts: 900, underlying: 'CRWD', right: 'C', strike: 340, expiry: '2026-10-16',
  multiplier: 100, price: 5.10, size: 50, bid: 5.00, ask: 5.10, conditions: [] };

test('print at the ask is a buy; at the bid is a sell; premium uses the multiplier', () => {
  assert.equal(classifyPrint(base).side, 'buy');
  assert.equal(classifyPrint({ ...base, price: 5.00 }).side, 'sell');
  assert.equal(classifyPrint(base).premium, 5.10 * 50 * 100);
});

test('midpoint print is UNKNOWN — not rounded to a side', () => {
  const r = classifyPrint({ ...base, price: 5.05 });
  assert.equal(r.side, 'unknown'); assert.equal(r.basis, 'midpoint');
});

test('a stale or future quote makes the side UNKNOWN', () => {
  assert.equal(classifyPrint({ ...base, quote_ts: 1000 - 5000 }).basis, 'stale_quote');
  assert.equal(classifyPrint({ ...base, quote_ts: 1500 }).basis, 'stale_quote');
});

test('crossed or locked quote → UNKNOWN; missing quote → UNKNOWN', () => {
  assert.equal(classifyPrint({ ...base, bid: 5.10, ask: 5.10 }).basis, 'crossed_or_locked');
  assert.equal(classifyPrint({ ...base, bid: null }).basis, 'no_quote');
});

test('late / out-of-sequence prints are excluded from flow entirely', () => {
  const r = classifyPrint({ ...base, conditions: ['LATE'] });
  assert.equal(r.flow_eligible, false);
});

test('duplicates, corrections and cancels do not double-count', () => {
  const prints = [
    base,
    base,                                                   // duplicate
    { ...base, ref_id: 'r2', size: 10 },
    { ...base, ref_id: 'r2', size: 20, correction: 'correct' },   // corrected size wins
    { ...base, ref_id: 'r3', size: 999 },
    { ...base, ref_id: 'r3', correction: 'cancel' },              // cancelled — gone
  ];
  const kept = reconcile(prints);
  assert.deepEqual(kept.map((p) => [p.ref_id, p.size]).sort(), [['r1', 50], ['r2', 20]]);
  assert.equal(aggregateFlow(prints, null).call_vol, 70);
});

test('ambiguous flow does not become certain institutional buying', () => {
  const prints = [
    { ...base, ref_id: 'a', price: 5.05, size: 400 },        // midpoint, huge
    { ...base, ref_id: 'b', price: 5.10, size: 10 },         // small buy
  ];
  const agg = aggregateFlow(prints, null);
  assert.ok(agg.unknown_share > 0.5);
  assert.equal(agg.net_directional_prem, null);
  assert.match(agg.directional_note, /no directional read/);
});

test('with classifiable flow, the directional estimate is labelled an estimate and spreads are not grouped', () => {
  const prints = [
    { ...base, ref_id: 'a', price: 5.10, size: 100 },                          // buy call
    { ...base, ref_id: 'b', right: 'P', price: 3.00, bid: 3.00, ask: 3.10, size: 40 },  // sell put
  ];
  const agg = aggregateFlow(prints, { call_vol_avg20: 50, put_vol_avg20: 50 });
  assert.ok(agg.net_directional_prem > 0);
  assert.equal(agg.call_vol_ratio, 2);
  assert.equal(agg.put_vol_ratio, 0.8);
  assert.match(agg.directional_note, /estimate/);
});

test('no baseline → ratios are null, never 1', () => {
  const agg = aggregateFlow([base], null);
  assert.equal(agg.call_vol_ratio, null);
});

test('25-delta skew picks the nearest expiry ≥ 20 DTE and the closest-to-25Δ contracts', () => {
  const chain = [
    { expiry: '2026-09-18', right: 'P', delta: -0.25, iv: 0.9 },   // 3 DTE — too near
    { expiry: '2026-09-18', right: 'C', delta: 0.25, iv: 0.5 },
    { expiry: '2026-10-16', right: 'P', delta: -0.22, iv: 0.62 },
    { expiry: '2026-10-16', right: 'P', delta: -0.40, iv: 0.58 },
    { expiry: '2026-10-16', right: 'C', delta: 0.27, iv: 0.50 },
  ];
  const s = putSkew25d(chain, { asOf: '2026-09-15' });
  assert.equal(s.expiry, '2026-10-16');
  assert.ok(Math.abs(s.skew - 0.12) < 1e-9);
  assert.equal(putSkew25d(chain.filter((c) => c.right === 'C'), { asOf: '2026-09-15' }).skew, null);
});

test('unknown dealer inventory stays an estimate; missing OI date or coverage refuses to compute', () => {
  const chain = [
    { right: 'C', strike: 340, gamma: 0.02, oi: 1000, multiplier: 100 },
    { right: 'P', strike: 330, gamma: 0.015, oi: 3000, multiplier: 100 },
  ];
  const g = gexSign(chain, 338, { oiBusinessDate: '2026-09-12' });
  assert.equal(g.sign, -1);
  assert.equal(g.assumption, 'dealers_short_customer');
  assert.match(g.note, /not observed/);
  assert.equal(gexSign(chain, 338, {}).sign, null);
  assert.equal(gexSign([...chain, { right: 'C', strike: 350, gamma: 0.01, oi: null }, { right: 'C', strike: 360, gamma: 0.01, oi: null }], 338, { oiBusinessDate: '2026-09-12' }).sign, null);
});
