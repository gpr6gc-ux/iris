// iris2_investing() + iris2_investing_security(p_symbol) — sample data for preview mode.
// Mirrors the live shape from market.decisions / market.regime (deterministic engine). Synthetic prices.
import { ok } from './_state.js';

const card = (o) => ({
  symbol: o.symbol, name: o.name, posture: o.posture, direction: o.direction,
  conviction: o.conviction, band: o.conviction >= 70 ? 'High' : o.conviction >= 40 ? 'Medium' : 'Low',
  status: 'actionable', surfaced: true, close: o.close, chg_1d: o.chg_1d ?? 0.004,
  ret_1m: o.ret_1m ?? 0.03, ret_3m: o.ret_3m ?? 0.08, rsi: o.rsi ?? 58, pctb: o.pctb ?? 0.7, pos_52w: o.pos_52w ?? 0.7,
  options: o.options, options_checked: false, headline: o.headline,
  entry: o.close, stop: o.stop, target: o.target, risk_pct: o.risk_pct ?? 0.04, rr: 2.0,
  stop_basis: o.stop_basis ?? 'sma20', stop_distance_pct: o.risk_pct ?? 0.04, target_kind: 'scenario_2r',
  levels: { entry: 'last close of the session dated as_of', stop: ({ sma20: '20-day SMA', sma50: '50-day SMA', bb_lower: 'lower Bollinger band (20, 2σ)', bb_upper: 'upper Bollinger band (20, 2σ)' })[o.stop_basis ?? 'sma20'], target: 'entry + 2 × (entry − stop): a scenario reference level, not a forecast' },
  price_state: o.price_state ?? 'LAST_SESSION', sessions_behind: o.sessions_behind ?? 0,
  evidence_families: o.evidence_families ?? 3, families_agree: o.families_agree ?? 2, model_version: 'decisions-2026.09.15',
  why: o.why, as_of: o.as_of ?? '2026-09-11', has_fundamentals: o.has_fundamentals ?? true, regime: 'normal',
});

const why = (a, b, c) => [a, b, c];
const F = (k, label, text, points) => ({ k, label, text, points });

export const investing = () => ok({
  as_of: '2026-09-11',
  model_version: 'decisions-2026.09.15',
  multidim_mode: 'factors',
  regime: {
    state: 'normal', stability: 63, shaky: false,
    breadth_above50: 0.45, breadth_above200: 0.59, breadth_rsi_bull: 0.34, net_1m: -0.24,
    mkt_ret_1m: -0.023, mkt_rvol: 0.09, mkt_rvol_pctile: 0.05, mkt_above_sma50: false, curve_2s10s: 0.41, gex_regime: null,
    explain: '45% of stocks above their 50-day · 59% above their 200-day · proxy vol 9% (5th pctile of its own 6mo) · market proxy below its 50-day trend · 2s10s 0.41 · GEX n/a',
    contrib: { breadth50: 11.3, breadth200: 8.9, trend: 6.9, rvol: 23.8, curve: 9.1, thrust: 2.6 },
    as_of: '2026-09-11',
  },
  counts: { actionable: 648, longs: 277, shorts: 371, universe: 1297, by_status: { actionable: 648, watch: 630, stale: 19 }, by_price_state: { LAST_SESSION: 1278, STALE: 19 }, priced_tickers: 12479 },
  watchlist: [
    card({ symbol: 'AAPL', name: 'APPLE INC', posture: 'LONG', direction: 'long', conviction: 47, close: 324.96, rsi: 73, pctb: 1.03, pos_52w: 0.87, ret_1m: 0.05, ret_3m: 0.05,
      options: 'Call debit spread or a starter long', headline: 'Above the 50 & 200-day with positive momentum — constructive long; invalidation below $313.55.',
      stop: 313.55, target: 347.78, risk_pct: 0.035, why: why(F('trend', 'Trend structure', 'Above the 50 & 200-day', 19.2), F('val', 'Valuation overlay', 'P/S 11.4 · P/E 42.3 · profitable', -15.6), F('rsi', 'RSI(14)', 'RSI 73', 13.4)) }),
    card({ symbol: 'NVDA', name: 'NVIDIA CORP', posture: 'LEAN LONG', direction: 'long', conviction: 40, close: 224.41, rsi: 49, pctb: 0.75, pos_52w: 0.84, ret_1m: 0.06, ret_3m: 0.04,
      options: 'Call debit spread or a starter long', headline: 'Above the 50 & 200-day with positive momentum — constructive long; invalidation below $219.29.',
      stop: 219.29, target: 234.65, risk_pct: 0.023, why: why(F('trend', 'Trend structure', 'Above the 50 & 200-day', 19.2), F('mom', 'Momentum (1m/3m)', 'Return 6% 1m · 4% 3m', 8.9), F('ma', 'Distance to 200-day', '13% above the 200-day', 10)) }),
    card({ symbol: 'TSLA', name: 'TESLA INC', posture: 'LEAN SHORT', direction: 'short', conviction: 25, close: 357.01, rsi: 44, pctb: 0.4, pos_52w: 0.5, ret_1m: -0.04, ret_3m: -0.07, price_state: 'STALE', sessions_behind: 3, as_of: '2026-09-08', stop_basis: 'sma50',
      options: 'Put debit spread, or trim / avoid', headline: 'Below the 50 & 200-day and weak momentum — short / avoid; invalidation above $358.35.',
      stop: 358.35, target: 354.33, risk_pct: 0.004, why: why(F('trend', 'Trend structure', 'Below the 50 & 200-day', -19.2), F('ma', 'Distance to 200-day', '-11% below the 200-day', -10), F('val', 'Valuation overlay', 'P/S 14.9 · P/E 371.6 · profitable', -6.4)) }),
    { symbol: 'SPY', name: 'S&P 500 ETF', status: 'insufficient_history', bars: 2, bars_needed: 60, last_bar: '2026-09-11', note: '2 daily bars on file, 60 needed — history backfill pending' },
    { symbol: 'QQQ', name: 'Nasdaq-100 ETF', status: 'insufficient_history', bars: 2, bars_needed: 60, last_bar: '2026-09-11', note: '2 daily bars on file, 60 needed — history backfill pending' },
    { symbol: 'IWM', name: 'Russell 2000 ETF', status: 'no_price_data', bars: 0, bars_needed: 60, last_bar: null, note: 'no price history' },
  ],
  longs: [
    card({ symbol: 'IBEX', name: 'IBEX LTD', posture: 'LONG', direction: 'long', conviction: 93, close: 38.94, rsi: 71, pctb: 0.95, pos_52w: 0.98, ret_1m: 0.07, ret_3m: 0.30,
      options: 'Calls or call debit spreads', headline: 'Above the 50 & 200-day with positive momentum — constructive long; invalidation below $36.76.',
      stop: 36.76, target: 43.30, risk_pct: 0.056, why: why(F('trend', 'Trend structure', 'Above the 50 & 200-day, golden cross', 24), F('mom', 'Momentum (1m/3m)', 'Return 7% 1m · 30% 3m', 20), F('rsi', 'RSI(14)', 'RSI 71', 14.9)) }),
    card({ symbol: 'ANF', name: 'ABERCROMBIE & FITCH CO', posture: 'LONG', direction: 'long', conviction: 85, close: 136.60, rsi: 69, pctb: 0.76, pos_52w: 0.86, ret_1m: 0.24, ret_3m: 0.79,
      options: 'Calls or call debit spreads', headline: 'Above the 50 & 200-day with positive momentum — constructive long; invalidation below $120.02.',
      stop: 120.02, target: 169.77, risk_pct: 0.121, why: why(F('mom', 'Momentum (1m/3m)', 'Return 24% 1m · 79% 3m', 20), F('trend', 'Trend structure', 'Above the 50 & 200-day', 19.2), F('val', 'Valuation overlay', 'P/S 1.4 · P/E 11.0 · profitable', 12.1)) }),
    card({ symbol: 'VAL', name: 'VALARIS LTD', posture: 'LONG', direction: 'long', conviction: 84, close: 61.20, rsi: 66, pctb: 0.82, pos_52w: 0.79, ret_1m: 0.10, ret_3m: 0.26,
      options: 'Calls or call debit spreads', headline: 'Above the 50 & 200-day with positive momentum — constructive long; invalidation below $55.40.',
      stop: 55.40, target: 72.80, risk_pct: 0.095, why: why(F('trend', 'Trend structure', 'Above the 50 & 200-day, golden cross', 24), F('mom', 'Momentum (1m/3m)', 'Return 10% 1m · 26% 3m', 18), F('val', 'Valuation overlay', 'P/S 1.9 · P/E 9.4 · profitable', 13.6)) }),
  ],
  shorts: [
    card({ symbol: 'CAMT', name: 'CAMTEK LTD', posture: 'SHORT', direction: 'short', conviction: 82, close: 131.91, rsi: 22, pctb: -0.05, pos_52w: 0.18, ret_1m: -0.13, ret_3m: -0.28,
      options: 'Puts or put debit spreads', headline: 'Below the 50 & 200-day with a death cross and weak momentum — short / avoid; invalidation above $149.00.',
      stop: 149.00, target: 97.74, risk_pct: 0.13, why: why(F('trend', 'Trend structure', 'Below the 50 & 200-day, death cross', -24), F('mom', 'Momentum (1m/3m)', 'Return -13% 1m · -28% 3m', -20), F('rsi', 'RSI(14)', 'RSI 22 (oversold)', -10.5)) }),
    card({ symbol: 'CAVA', name: 'CAVA GROUP INC', posture: 'SHORT', direction: 'short', conviction: 77, close: 58.40, rsi: 31, pctb: 0.12, pos_52w: 0.14, ret_1m: -0.11, ret_3m: -0.24,
      options: 'Puts or put debit spreads', headline: 'Below the 50 & 200-day and weak momentum — short / avoid; invalidation above $67.10.',
      stop: 67.10, target: 40.00, risk_pct: 0.149, why: why(F('trend', 'Trend structure', 'Below the 50 & 200-day, death cross', -24), F('mom', 'Momentum (1m/3m)', 'Return -11% 1m · -24% 3m', -18), F('val', 'Valuation overlay', 'P/S 3.8 · P/E 62.0 · profitable', -8.4)) }),
    card({ symbol: 'LII', name: 'LENNOX INTERNATIONAL', posture: 'SHORT', direction: 'short', conviction: 78, close: 470.00, rsi: 35, pctb: 0.2, pos_52w: 0.22, ret_1m: -0.08, ret_3m: -0.18,
      options: 'Puts or put debit spreads', headline: 'Below the 50 & 200-day and weak momentum — short / avoid; invalidation above $505.00.',
      stop: 505.00, target: 400.00, risk_pct: 0.074, why: why(F('trend', 'Trend structure', 'Below the 50 & 200-day, death cross', -24), F('mom', 'Momentum (1m/3m)', 'Return -8% 1m · -18% 3m', -16), F('ma', 'Distance to 200-day', '-9% below the 200-day', -8.6)) }),
  ],
  feeds: {
    prices: { as_of: '2026-09-11', state: 'LAST_SESSION', sessions_behind: 0, last_completed_session: '2026-09-11', dataset: 'inv.prices', source: 'massive:grouped-daily', cadence: 'one session per run, after the provider\'s end of day', tickers: 12479, coverage_vs_prior: 0.998, basis: 'newest session with >= 1,000 bars; a single ticker with a newer bar does not count' },
    decisions: { computed_at: '2026-09-12T08:31:02Z', as_of: '2026-09-11', model_version: 'decisions-2026.09.15', basis: 'recomputed from inv.prices after each price load' },
    chains: { as_of: '2026-09-11T20:00:05Z', basis: 'source_as_of', age_s: 5400, provider_delay_s: 900, state: 'LAST_SESSION', dataset: 'market.chain_snapshots', source: 'cboe:delayed_quotes (15-minute delayed)', cadence: '14:00, 17:00, 20:00 ET on session days', oi_business_date: '2026-09-10', symbols: 12 },
    macro: { as_of: '2026-09-10', state: 'DELAYED', sessions_behind: 1, last_completed_session: '2026-09-11', dataset: 'inv.macro', source: 'FRED', cadence: 'daily 11:15 UTC; series publish with their own lags' },
    fundamentals: { as_of: '2026-09-03', dataset: 'inv.fundamentals', source: 'SEC EDGAR XBRL', cadence: 'nightly; only fills missing coverage', state: 'REFERENCE' },
  },
  freshness: { prices_as_of: '2026-09-11', prices_stale: false, fundamentals_as_of: '2026-09-03', macro_as_of: '2026-09-10', computed_at: '2026-09-12T08:31:02Z' },
  scope_note: 'Decisions cover the 1297 names with at least 60 daily bars; the price feed itself covers 12479 tickers and the history backfill is in progress (benchmark ETFs included). Levels are observed moving averages and bands; the 2R level is a scenario reference, not a forecast. Decision-support, not advice.',
});

// iris2_investing_outcomes(p_symbol) — graded outcomes are empty until publications reach their horizons.
export const investingOutcomes = () => ok({
  summary: { grader_version: 'grader-2026.09.15', pub_kind: 'decision', horizons: {}, definitions: { ret_net: 'direction x (exit close / execution close - 1) - round-trip cost' } },
  signals_summary: { grader_version: 'grader-2026.09.15', pub_kind: 'signal', horizons: {} },
  pending: 648, publications: 648, graded: 0, benchmark_unavailable: 0, last_completed_session: '2026-09-11',
  symbol_outcomes: [], symbol_publications: [{ pub_kind: 'decision', direction: 1, published_at: '2026-09-12T08:31:02Z', first_eligible_execution_at: '2026-09-14T13:35:00Z', conviction: 47 }],
});

export const positioning = () => {
  const spot = 770.19;
  const strikes = [745, 750, 755, 760, 765, 768, 770, 772, 775, 780, 785, 790, 795, 800];
  const lattice = strikes.map((k) => {
    const below = k < spot;
    const near = Math.abs(k - spot) < 12;
    const dg = Math.round((below ? -1 : 1) * (near ? 1 : 0.5) * (1.4e9 - Math.abs(k - spot) * 5e7) * (k === 760 ? 1.1 : k === 780 ? 0.55 : 0.6));
    return { k, dg, coi: Math.round(20000 - Math.abs(k - spot) * 300 + (k > spot ? 8000 : 0)), poi: Math.round(30000 - Math.abs(k - spot) * 400 + (k < spot ? 10000 : 0)) };
  });
  return ok({
    underlyings: [{
      symbol: 'SPY', priority: 10, name: 'S&P 500 ETF', as_of: '2026-09-05T06:00:28Z', spot,
      net_gex: -2782005246, gross_gex: 9671820262, regime: 'negative', call_wall: 780, put_wall: 760, zero_gamma: null,
      put_call_oi_ratio: 1.674, total_call_oi: 978585, total_put_oi: 1637879, contracts: 100, expiries: 7,
      lattice,
      pulse: { call_vol: 187944, put_vol: 391270, pc_vol_ratio: 2.08, top: [{ k: 770, v: 237537 }, { k: 760, v: 72607 }, { k: 745, v: 41687 }, { k: 780, v: 21942 }, { k: 775, v: 21850 }] },
      vector: 'Dealers short gamma (amplifying) — moves tend to extend, not fade. Put wall $760 is support; a break below accelerates. Call wall $780 caps rallies.',
    }],
    as_of: '2026-09-05T06:00:28Z',
    coverage: { symbols: 1, watchlist: 12 },
    note: 'Dealer positioning is an ESTIMATE from the CBOE 15-minute-delayed chain (dealer long-call/short-put convention). Not real-time OPRA tape. Decision-support, not advice.',
  });
};

// iris2_positioning_signals() — the deterministic 4-gate dealer-positioning detector surface.
export const positioningSignals = () => {
  const g = (fresh, multidim, verified) => ({ fresh, multidim, verified, explained: true });
  const gd = (contracts, expiries, age) => ({ fresh: { pass: true, age_min: age }, verified: { pass: true, contracts, expiries }, multidim: { pass: true }, explained: { pass: true } });
  const fac = (k, label, text) => ({ k, label, text });
  const S = (o) => ({ novelty: 1.0, noise_prob: 0, regime: 'negative', status: o.surfaced ? 'active' : 'watch', as_of: '2026-09-06T18:30:14Z', ...o });
  const signals = [
    S({ symbol: 'AAPL', name: 'Apple', kind: 'flip', behavior: 'flip_risk', direction: 0, conviction: 92, band: 'High', regime: 'positive', confirmations: 2, surfaced: true, gates: g(true, true, true), gate_detail: gd(319, 6, 0),
      headline: 'Spot $320.01 sits 0.00% from the gamma flip $320 — the level dividing dealer suppression (above) from amplification (below). Volatility changes character on a cross.',
      invalidation: 'Regime flips on a close through $320',
      factors: [fac('flip', 'Flip level', '$320 vs spot $320.01'), fac('side', 'Current side', 'above — suppressed'), fac('net_gex', 'Net dealer gamma', '+$624M')],
      evidence: { spot: 320.01, net_gex: 623876430, zero_gamma: 320, call_wall: 330, put_wall: 300, pin_strike: 320, contracts: 319, expiries: 6 } }),
    S({ symbol: 'NVDA', name: 'NVIDIA', kind: 'call_wall', behavior: 'resistance', direction: -1, conviction: 91, band: 'High', regime: 'positive', confirmations: 3, surfaced: true, gates: g(true, true, true), gate_detail: gd(249, 6, 0),
      headline: 'Spot $229.49 is testing the call wall $230 — the largest call-gamma strike, where dealer selling caps rallies (reinforced by positive gamma).',
      invalidation: 'Resistance fails on a close above $230',
      factors: [fac('wall', 'Call wall', '$230, 0.22% overhead'), fac('regime', 'Gamma regime', 'positive'), fac('flow', 'Volume vs OI', '0.42×')],
      evidence: { spot: 229.49, net_gex: 1275401588, zero_gamma: 225, call_wall: 230, put_wall: 200, pin_strike: 230, contracts: 249, expiries: 6 } }),
    S({ symbol: 'SPY', name: 'S&P 500 ETF', kind: 'gamma_regime', behavior: 'amplifying', direction: 0, conviction: 90, band: 'High', confirmations: 3, surfaced: true, gates: g(true, true, true), gate_detail: gd(2269, 7, 0),
      headline: 'Dealers are short gamma (net GEX -$3.8B) — hedging amplifies moves rather than damping them. Put wall $760 is the support that accelerates on a break; rallies stall into the call wall $780.',
      invalidation: 'Amplification eases if net GEX turns positive',
      factors: [fac('net_gex', 'Net dealer gamma', '-$3.8B (short-gamma / amplifying)'), fac('walls', 'Key levels', 'Support $760 · resistance $780'), fac('flow', 'Volume vs OI', '2.33× day volume / open interest')],
      evidence: { spot: 770.19, net_gex: -3756818517, zero_gamma: null, call_wall: 780, put_wall: 760, pin_strike: 770, contracts: 2269, expiries: 7 } }),
    S({ symbol: 'QQQ', name: 'Nasdaq 100 ETF', kind: 'flow', behavior: 'accumulation', direction: -1, conviction: 70, band: 'High', confirmations: 2, surfaced: true, gates: g(true, true, true), gate_detail: gd(2045, 7, 0),
      headline: 'Unusual flow at $718 — 156573 contracts today against 15590 open interest (10.0×), put-heavy (bearish tilt).',
      invalidation: 'Flow signal fades if volume normalizes on the next session',
      factors: [fac('strike', 'Busiest strike', '$718'), fac('voloi', 'Volume / OI', '10.0× (156573 vs 15590)'), fac('tilt', 'Call/put split', '70000 calls / 86573 puts')],
      evidence: { spot: 717.5, net_gex: -717482948, zero_gamma: null, call_wall: 730, put_wall: 700, pin_strike: 700, contracts: 2045, expiries: 7 } }),
    S({ symbol: 'DIA', name: 'Dow Jones ETF', kind: 'put_wall', behavior: 'support', direction: 1, conviction: 86, band: 'High', regime: 'positive', confirmations: 1, surfaced: false, noise_prob: 0.168, gates: g(true, false, true), gate_detail: gd(922, 7, 0),
      headline: 'Spot $532.34 is testing the put wall $530 — the largest put-gamma strike, where dealer buying supports.',
      invalidation: 'Support fails on a close below $530',
      factors: [fac('wall', 'Put wall', '$530, 0.44% below'), fac('regime', 'Gamma regime', 'positive'), fac('flow', 'Volume vs OI', '0.05×')],
      evidence: { spot: 532.34, net_gex: 43746702, zero_gamma: 550, call_wall: 540, put_wall: 530, pin_strike: 540, contracts: 922, expiries: 7 } }),
    S({ symbol: 'IWM', name: 'Russell 2000 ETF', kind: 'gamma_regime', behavior: 'amplifying', direction: 0, conviction: 80, band: 'High', confirmations: 1, surfaced: false, noise_prob: 0.193, gates: g(true, false, true), gate_detail: gd(1083, 7, 0),
      headline: 'Dealers are short gamma (net GEX -$2.3B) — hedging amplifies moves rather than damping them. Put wall $290 is the support that accelerates on a break; rallies stall into the call wall $305.',
      invalidation: 'Amplification eases if net GEX turns positive',
      factors: [fac('net_gex', 'Net dealer gamma', '-$2.3B (short-gamma / amplifying)'), fac('walls', 'Key levels', 'Support $290 · resistance $305'), fac('flow', 'Volume vs OI', '0.19× day volume / open interest')],
      evidence: { spot: 296.01, net_gex: -2327135741, zero_gamma: null, call_wall: 305, put_wall: 290, pin_strike: 290, contracts: 1083, expiries: 7 } }),
  ];
  return ok({
    signals,
    counts: { surfaced: signals.filter((s) => s.surfaced).length, watch: signals.filter((s) => !s.surfaced).length, total: signals.length },
    as_of: '2026-09-06T18:30:14Z',
    note: 'Deterministic dealer-positioning signals from the CBOE 15-min-delayed chain. Every score is a fixed function of option structure — no model. Decision-support, not advice.',
  });
};

export const investingSecurity = (args) => {
  const sym = (args && (args.p_symbol || args.symbol)) || 'AAPL';
  const base = 320, closes = Array.from({ length: 120 }, (_, i) => +(base * (0.82 + 0.18 * (i / 119)) + Math.sin(i / 6) * 6).toFixed(2));
  return ok({
    decision: card({ symbol: sym, name: 'APPLE INC', posture: 'LONG', direction: 'long', conviction: 47, close: 324.96, rsi: 73, pctb: 1.03, pos_52w: 0.87, ret_1m: 0.05, ret_3m: 0.05,
      options: 'Call debit spread or a starter long', headline: 'Above the 50 & 200-day with positive momentum — constructive long; invalidation below $313.55.',
      stop: 313.55, target: 347.78, risk_pct: 0.035, why: why(F('trend', 'Trend structure', 'Above the 50 & 200-day', 19.2), F('val', 'Valuation overlay', 'P/S 11.4 · P/E 42.3 · profitable', -15.6), F('rsi', 'RSI(14)', 'RSI 73', 13.4)) }),
    technicals: { symbol: sym, as_of: '2026-09-02', close: 324.96, sma20: 312.02, sma50: 313.55, sma200: 283.33, bb_pctb: 1.03, rsi14: 73.3, ret_1m: 0.05, ret_3m: 0.05, pos_52w: 0.87, rvol_20: 0.18, dist_sma200: 0.147, trend_stack: 1, cross_state: null },
    factors: [
      F('trend', 'Trend structure', 'Above the 50 & 200-day', 19.2),
      F('ma', 'Distance to 200-day', '15% above the 200-day', 10),
      F('mom', 'Momentum (1m/3m)', 'Return 5% 1m · 5% 3m', 6.0),
      F('rsi', 'RSI(14)', 'RSI 73', 13.4),
      F('bb', 'Bollinger %B', 'Above the upper band (%B 1.03)', -1.2),
      F('val', 'Valuation overlay', 'P/S 11.4 · P/E 42.3 · profitable', -15.6),
    ],
    fundamentals: { name: 'APPLE INC', exchange: 'Nasdaq', sic_desc: 'Electronic Computers', revenue_ttm: 421000000000, net_income_ttm: 104000000000, equity: 74000000000, debt: 98000000000 },
    history: closes.map((c, i) => ({ d: `2026-0${1 + Math.floor(i / 40)}-${(i % 28) + 1}`, c })),
  });
};
