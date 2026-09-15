// IRIS — Massive (ex-Polygon) websocket ProviderClient for the market-data streaming adapter.
//
// Implements the ProviderClient contract MarketStream expects:
//   name, dataset, replay=false, entitlement ('real-time'|'delayed-15m'), entitlementDelayS,
//   connect(), subscribe(symbols), async *messages() → normalized {symbol,last?,bid?,ask?,session_volume?,event_time,seq,halted?}, close().
//
// ENTITLEMENT IS NOT ASSUMED. The plan's stream and delay differ by tier (see investing/PROVIDERS.md): minute/second
// aggregates from Starter (15-min delayed), NBBO quotes only on Advanced (real-time). Before the adapter is allowed to
// label anything, verifyEntitlement() makes ONE REST call and reads what the key actually returns; the caller passes
// the result in. Without a key, the adapter uses the ReplayClient instead — never this client with a guessed tier.
//
// The websocket wire format below matches Polygon/Massive's documented stocks cluster (A = second aggregate,
// Q = quote, T = trade). It is behind a dynamic require of 'ws' so the module loads (and unit-tests) without the
// dependency installed; the station installs `ws` when a live key is configured. Until a real request/response pair
// has been observed with an entitled key, treat the field mapping as unverified and keep the ReplayClient in front.

'use strict';

const WS_URL = 'wss://socket.polygon.io/stocks';           // Massive still serves the polygon.io socket after the rebrand
const REST = 'https://api.polygon.io';

// One REST probe that reveals what the key is entitled to, without guessing. Returns
// { entitlement: 'real-time'|'delayed-15m'|'unknown', delayS, evidence }.
async function verifyEntitlement(apiKey, fetchImpl) {
  const f = fetchImpl || globalThis.fetch;
  if (!f) throw new Error('no fetch available to verify entitlement');
  // last-trade for SPY: the response carries the timestamp; real-time vs 15-min is read from how old it is intraday.
  const r = await f(`${REST}/v2/last/trade/SPY?apiKey=${encodeURIComponent(apiKey)}`);
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403 || (j && /NOT_AUTHORIZED|not entitled|unknown api key/i.test(JSON.stringify(j)))) {
    return { entitlement: 'unknown', delayS: null, evidence: `HTTP ${r.status}: ${JSON.stringify(j).slice(0, 200)}` };
  }
  const ts = j && j.results && (j.results.t || j.results.sip_timestamp);      // ns epoch
  const ageMs = ts ? Date.now() - Math.round(ts / 1e6) : null;
  // Heuristic only, and labelled as such: a fresh trade during market hours implies real-time; a ~15-min-old one implies delayed.
  const entitlement = ageMs == null ? 'unknown' : (ageMs < 5 * 60000 ? 'real-time' : 'delayed-15m');
  return { entitlement, delayS: entitlement === 'real-time' ? 0 : 900, evidence: `last trade age ${ageMs} ms`, unverified: true };
}

class MassiveClient {
  constructor({ apiKey, entitlement = 'delayed-15m', entitlementDelayS = 900, wsUrl = WS_URL, WS } = {}) {
    this.name = 'massive'; this.dataset = 'stocks/aggregates/second'; this.replay = false;
    this.apiKey = apiKey; this.entitlement = entitlement; this.entitlementDelayS = entitlementDelayS;
    this.wsUrl = wsUrl; this._WS = WS; this._queue = []; this._waiters = []; this._closed = false;
  }
  _emit(m) { if (this._waiters.length) this._waiters.shift()(m); else this._queue.push(m); }
  async connect() {
    const WS = this._WS || require('ws');                  // dynamic: not needed for unit tests
    this.ws = new WS(this.wsUrl);
    await new Promise((res, rej) => { this.ws.on('open', res); this.ws.on('error', rej); });
    this.ws.send(JSON.stringify({ action: 'auth', params: this.apiKey }));
    this.ws.on('message', (buf) => {
      let arr; try { arr = JSON.parse(buf.toString()); } catch { return; }
      for (const ev of (Array.isArray(arr) ? arr : [arr])) this._onWire(ev);
    });
    this.ws.on('close', () => { this._closed = true; this._emit(null); });
    this.ws.on('error', () => { this._closed = true; this._emit(null); });
  }
  async subscribe(symbols) {
    // Starter/Developer: second aggregates (A.*). Advanced adds quotes (Q.*). Subscribe to both; unentitled channels
    // are simply never delivered by the server.
    const params = symbols.map((s) => `A.${s}`).concat(symbols.map((s) => `Q.${s}`)).join(',');
    this.ws.send(JSON.stringify({ action: 'subscribe', params }));
  }
  _onWire(ev) {
    if (!ev || !ev.ev) return;
    if (ev.ev === 'A') {                                    // second aggregate: sym, c=close, v=volume, e=end ms
      this._emit({ symbol: ev.sym, last: ev.c, session_volume: ev.av != null ? ev.av : ev.v, event_time: ev.e || ev.s, seq: ev.e, dataset: 'stocks/aggregates/second' });
    } else if (ev.ev === 'Q') {                             // NBBO quote (Advanced): bp=bid, ap=ask, t=ns
      this._emit({ symbol: ev.sym, bid: ev.bp, ask: ev.ap, event_time: ev.t ? Math.round(ev.t / 1e6) : undefined, seq: ev.q, dataset: 'stocks/quotes' });
    } else if (ev.ev === 'status' && /halt/i.test(ev.message || '')) {
      // Massive does not send equity halts on this cluster; kept for shape completeness.
    }
  }
  async *messages() {
    while (!this._closed || this._queue.length) {
      const m = this._queue.length ? this._queue.shift() : await new Promise((res) => this._waiters.push(res));
      if (m === null) return;                                // socket closed
      yield m;
    }
  }
  async close() { this._closed = true; try { this.ws && this.ws.close(); } catch { /* ignore */ } this._emit(null); }
}

module.exports = { MassiveClient, verifyEntitlement, WS_URL, REST };
