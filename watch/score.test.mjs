import { test } from 'node:test';
import assert from 'node:assert/strict';
import { score, STANCE } from './score.mjs';

const crwd = { narrative_velocity: 8, price_move_pct: 4.1, pct_b: 0.82, rsi14: 61, call_vol_ratio: 3.1, put_vol_ratio: 0.9,
  iv_change_pct: 12, put_skew_change: -0.4, gex_sign: -1, regime: 'NORMAL', invalidation_level: 335, lookback_bars: 200 };

test('the CrowdStrike weekend: narrative + price + flow agree, entry has room → CONFIRMED', () => {
  const r = score(crwd);
  assert.equal(r.stance, STANCE.CONFIRMED);
  assert.equal(r.direction, 'up');
  assert.equal(r.invalidation, 335);
  assert.ok(r.reasons.find((x) => x.family === 'positioning').text.includes('amplified'));
});

test('same setup but blown past the upper band → EXTENDED_WAIT, not CONFIRMED', () => {
  const r = score({ ...crwd, pct_b: 1.22, rsi14: 81 });
  assert.equal(r.stance, STANCE.EXTENDED_WAIT);
  assert.match(r.reasons.find((x) => x.family === 'entry').text, /pullback/);
});

test('narrative firing, price not yet responding → WATCH', () => {
  assert.equal(score({ ...crwd, price_move_pct: 0.4 }).stance, STANCE.WATCH);
});

test('price moved with no story → QUIET, and says why', () => {
  const r = score({ ...crwd, narrative_velocity: 1.1 });
  assert.equal(r.stance, STANCE.QUIET);
  assert.ok(r.reasons.some((x) => /without narrative/.test(x.text || '')));
});

test('no options data → DEVELOPING, never CONFIRMED, and flow is listed as missing', () => {
  const r = score({ ...crwd, call_vol_ratio: null, put_vol_ratio: null, iv_change_pct: null });
  assert.equal(r.stance, STANCE.DEVELOPING);
  assert.ok(r.missing.includes('options_flow'));
});

test('direction comes from price, never from text: down move with put flow → CONFIRMED down', () => {
  const r = score({ ...crwd, price_move_pct: -3.2, call_vol_ratio: 0.8, put_vol_ratio: 2.6 });
  assert.equal(r.direction, 'down');
  assert.equal(r.stance, STANCE.CONFIRMED);
});

test('missing narrative → INSUFFICIENT_DATA, not zero', () => {
  assert.equal(score({ ...crwd, narrative_velocity: null }).stance, STANCE.INSUFFICIENT_DATA);
});

test('the Sunday-night case: narrative firing, no price yet → WATCH with a re-score note, never CONFIRMED', () => {
  const r = score({ ...crwd, price_move_pct: null });
  assert.equal(r.stance, STANCE.WATCH);
  assert.equal(r.direction, null);
  assert.match(r.note, /confirm at 09:30/);
  assert.ok(r.missing.includes('price_move_pct'));
});

test('no narrative and no price → QUIET, not an alert', () => {
  assert.equal(score({ ...crwd, narrative_velocity: 1.2, price_move_pct: null }).stance, STANCE.QUIET);
});

test('fewer than 20 bars → technicals marked missing rather than computed on nothing', () => {
  const r = score({ ...crwd, lookback_bars: 12 });
  assert.ok(r.missing.some((m) => m.startsWith('technicals')));
});

test('rising put skew during an up move is surfaced as a contradiction', () => {
  const r = score({ ...crwd, put_skew_change: 1.8 });
  assert.ok(r.reasons.some((x) => /paying for downside/.test(x.text || '')));
});

test('no invalidation supplied → stance still computed, note says the caller must provide it', () => {
  const r = score({ ...crwd, invalidation_level: null });
  assert.equal(r.invalidation, null);
  assert.match(r.note, /invalidation level not supplied/);
});
