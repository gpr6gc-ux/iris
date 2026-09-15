// The momentum-watch scorer. Pure, deterministic, no I/O, no model.
//
// Takes one name's evidence — narrative velocity, price response, options flow, positioning
// and macro regime — and returns a stance with every reason listed and every threshold
// visible. Arithmetic sets the stance; a model may only have tagged which tweets were about
// which ticker upstream. Text never sets direction: direction comes from price.
//
// Every input may be null. A null input does not become zero — it marks that evidence
// family INSUFFICIENT and the stance says so. That is the whole reason this file exists.

export const THRESHOLDS = Object.freeze({
  narrative_velocity_min: 4,     // mentions vs the name's own trailing baseline (×)
  price_move_min_pct: 1.5,       // session or pre-market move that counts as "responding"
  flow_ratio_min: 2.0,           // call or put volume vs 20-day average (×)
  iv_change_min_pct: 8,          // 1-day IV change that counts as "options agree"
  pct_b_extended: 1.0,           // above the upper Bollinger band
  pct_b_stretched: 1.15,         // well above it — pullback more likely than not
  rsi_extended: 75,
});

export const STANCE = Object.freeze({
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
  QUIET: 'QUIET',
  WATCH: 'WATCH',                 // narrative moving, price not yet
  DEVELOPING: 'DEVELOPING',       // narrative + price, flow not confirming
  CONFIRMED: 'CONFIRMED',         // narrative + price + flow agree
  EXTENDED_WAIT: 'EXTENDED_WAIT', // everything agrees but the entry is stretched — expect pullback
});

const num = (v) => (v === null || v === undefined || Number.isNaN(Number(v))) ? null : Number(v);

/**
 * @param {object} e
 * @param {number|null} e.narrative_velocity  mentions in the window ÷ trailing baseline
 * @param {number|null} e.price_move_pct      signed session / pre-market move
 * @param {number|null} e.pct_b               Bollinger %B (1.0 = at upper band)
 * @param {number|null} e.rsi14
 * @param {number|null} e.call_vol_ratio      call volume ÷ 20-day average
 * @param {number|null} e.put_vol_ratio       put volume ÷ 20-day average
 * @param {number|null} e.iv_change_pct       1-day change in 30-day IV
 * @param {number|null} e.put_skew_change     1-day change in 25-delta put skew (positive = more downside demand)
 * @param {-1|0|1|null} e.gex_sign            dealer gamma sign near spot (-1 short gamma = moves amplified)
 * @param {string|null} e.regime              'NORMAL' | 'STRESS' | 'CRISIS' | ...
 * @param {number|null} e.invalidation_level  a price level — lower band or VWAP, supplied by the caller
 * @param {number|null} e.lookback_bars       bars available for the technicals
 */
export function score(e, T = THRESHOLDS) {
  const reasons = [];
  const missing = [];
  const need = (k) => { const v = num(e[k]); if (v === null) missing.push(k); return v; };

  const velocity = need('narrative_velocity');
  const move     = need('price_move_pct');
  const pctB     = num(e.pct_b);
  const rsi      = num(e.rsi14);
  const callR    = num(e.call_vol_ratio);
  const putR     = num(e.put_vol_ratio);
  const ivChg    = num(e.iv_change_pct);
  const skewChg  = num(e.put_skew_change);
  const gex      = num(e.gex_sign);
  const regime   = e.regime ?? null;
  const bars     = num(e.lookback_bars);

  // The two families that can trigger at all: narrative and price. Without both, nothing else matters.
  if (velocity === null || move === null) {
    return { stance: STANCE.INSUFFICIENT_DATA, direction: null, reasons, missing, invalidation: null };
  }

  // Direction is price, never text.
  const direction = move > 0 ? 'up' : move < 0 ? 'down' : null;
  const narrativeOn = velocity >= T.narrative_velocity_min;
  const priceOn = Math.abs(move) >= T.price_move_min_pct;

  reasons.push({ family: 'narrative', ok: narrativeOn, value: velocity, threshold: T.narrative_velocity_min, unit: '× baseline' });
  reasons.push({ family: 'price', ok: priceOn, value: move, threshold: T.price_move_min_pct, unit: '%' });

  if (!narrativeOn && !priceOn) return { stance: STANCE.QUIET, direction, reasons, missing, invalidation: null };
  if (narrativeOn && !priceOn)  return { stance: STANCE.WATCH, direction, reasons, missing, invalidation: null };
  if (!narrativeOn && priceOn) {
    // Price moved without a story. Not this tool's trade. Report it, do not chase it.
    reasons.push({ family: 'note', ok: false, text: 'price moved without narrative — not a momentum-news setup' });
    return { stance: STANCE.QUIET, direction, reasons, missing, invalidation: null };
  }

  // Flow: does options activity agree with the direction price is moving?
  let flowConfirms = null;
  if (callR === null && putR === null && ivChg === null) {
    missing.push('options_flow');
  } else {
    const alignedVol = direction === 'up' ? callR : putR;
    const volOk = alignedVol !== null && alignedVol >= T.flow_ratio_min;
    const ivOk  = ivChg !== null && ivChg >= T.iv_change_min_pct;
    flowConfirms = volOk || ivOk;
    reasons.push({ family: 'flow', ok: flowConfirms,
      value: { aligned_vol_ratio: alignedVol, iv_change_pct: ivChg }, threshold: { vol: T.flow_ratio_min, iv: T.iv_change_min_pct } });
    // Skew is the cleanest "expecting downside" read. It can contradict an up move.
    if (skewChg !== null && direction === 'up' && skewChg > 0) {
      reasons.push({ family: 'flow', ok: false, text: `put skew rising ${skewChg} while price up — someone is paying for downside` });
    }
  }

  // Entry quality: a name blown through its band is a worse entry, not a better one.
  let extended = false, stretched = false;
  if (pctB === null && rsi === null) {
    missing.push('technicals');
  } else if (bars !== null && bars < 20) {
    missing.push('technicals (fewer than 20 bars)');
  } else {
    if (pctB !== null) { extended = extended || pctB >= T.pct_b_extended; stretched = pctB >= T.pct_b_stretched; }
    if (rsi  !== null) { extended = extended || rsi  >= T.rsi_extended; }
    reasons.push({ family: 'entry', ok: !extended, value: { pct_b: pctB, rsi14: rsi }, threshold: { pct_b: T.pct_b_extended, rsi: T.rsi_extended },
      text: stretched ? 'well above the upper band — pullback more likely than not' : extended ? 'at/above the upper band — expect a pullback before continuation' : 'room to run' });
  }

  // Positioning is context, never a trigger.
  if (gex === null) missing.push('positioning');
  else reasons.push({ family: 'positioning', ok: true, value: gex, text: gex < 0 ? 'dealers short gamma near spot — moves likely amplified' : gex > 0 ? 'dealers long gamma — moves likely dampened' : 'flat' });

  // Regime is context. STRESS and worse cap the stance; they do not veto it.
  if (regime === null) missing.push('regime');
  else reasons.push({ family: 'regime', ok: regime === 'NORMAL', value: regime });

  let stance;
  if (flowConfirms === null)      stance = STANCE.DEVELOPING;     // cannot confirm without flow — say so, do not guess
  else if (!flowConfirms)         stance = STANCE.DEVELOPING;
  else if (extended)              stance = STANCE.EXTENDED_WAIT;
  else                            stance = STANCE.CONFIRMED;

  const invalidation = num(e.invalidation_level);
  return { stance, direction, reasons, missing, invalidation,
    note: invalidation === null ? 'invalidation level not supplied — caller must provide lower band or session VWAP' : null };
}
