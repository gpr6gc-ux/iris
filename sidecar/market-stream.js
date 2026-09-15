// IRIS — market-data streaming adapter (runs in the station on Greyson's PC, not the cloud)
//
// Connects to a provider's websocket, coalesces quotes per symbol, and flushes batches to Supabase through the
// token-gated worker lane (iris_md_quotes_upsert / iris_md_feed_state). It never runs an n8n execution or a model
// call per tick. Design points, each mapped to the implementation prompt §7:
//   - reconnect with exponential backoff + jitter; resubscribe on reconnect;
//   - a bounded per-symbol coalescing buffer (only the newest quote per symbol is kept between flushes);
//   - duplicate handling via provider sequence numbers; gap detection when a sequence jumps;
//   - a heartbeat that reports connection health to md.feed_state every few seconds;
//   - transport-lag percentiles (p50/p95/p99) measured from event_time → receive time, not guessed;
//   - a LIVE state is only ever emitted when the provider entitlement is real-time AND the socket is open; an
//     entitled delayed feed emits DELAYED; a closed socket writes connected:false so the read side downgrades.
//
// The provider client is pluggable (see ProviderClient below). A real Massive client is a thin adapter over its
// websocket; a ReplayClient (fixtures/*.ndjson) drives the same pipeline for tests and for a no-key demo, and is
// clearly a replay (its quotes carry quality_flags:["replay"] and the feed note says so).

'use strict';

const DEFAULTS = {
  supabaseUrl: process.env.IRIS_URL || 'https://ssuikijiaulfhfxzwrgu.supabase.co',
  anonKey: process.env.IRIS_ANON || '',
  token: process.env.IRIS_TOKEN || '',
  feed: 'stocks.quotes',
  flushMs: 1000,            // one batch per second, not one request per tick
  heartbeatMs: 5000,
  maxBackoffMs: 30000,
  lagWindow: 512,           // rolling window for percentiles
};

// A quantile from a small numeric window (no dependency).
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, base = Math.floor(pos), rest = pos - base;
  return sorted[base + 1] !== undefined ? Math.round(sorted[base] + rest * (sorted[base + 1] - sorted[base])) : Math.round(sorted[base]);
}

class MarketStream {
  constructor(opts = {}) {
    this.o = { ...DEFAULTS, ...opts };
    this.symbols = (opts.symbols || []).map((s) => s.toUpperCase());
    this.provider = opts.provider;                 // a ProviderClient instance (Massive or Replay)
    this.post = opts.post || httpPost;             // injectable for tests
    this.now = opts.now || (() => Date.now());
    this.log = opts.log || (() => {});
    this.buffer = new Map();                       // symbol -> newest normalized quote (coalescing)
    this.lastSeq = new Map();                      // symbol -> last provider sequence (dedupe + gap detection)
    this.lags = [];                                // rolling event→receive lag samples (ms)
    this.stats = { messages: 0, messagesSinceHeartbeat: 0, gaps: 0, dropped_dupes: 0, flushes: 0, flush_errors: 0 };
    this.connected = false;
    this.backoff = 500;
    this.stopped = false;
    this._timers = [];
  }

  // ---- lifecycle ----
  // start() sets up the flush/heartbeat timers and kicks off the connect loop in the background, then returns.
  // The connect loop reconnects forever until stop(); it is not awaited here (awaiting it would never resolve).
  // The returned promise is the loop, exposed as this.running for a caller that wants to await shutdown.
  start() {
    this.stopped = false;
    this._flushTimer = setInterval(() => this.flush().catch((e) => this.log('flush error', e.message)), this.o.flushMs);
    this._hbTimer = setInterval(() => this.heartbeat().catch((e) => this.log('heartbeat error', e.message)), this.o.heartbeatMs);
    this._timers.push(this._flushTimer, this._hbTimer);
    this.running = this.connectLoop();
    return Promise.resolve();
  }

  async stop() {
    this.stopped = true;
    for (const t of this._timers) clearInterval(t);
    if (this.provider && this.provider.close) try { await this.provider.close(); } catch { /* ignore */ }
    this.connected = false;
    if (this.running) await this.running.catch(() => {});   // let the connect loop unwind
    await this.flush().catch(() => {});
    await this.reportState('DISCONNECTED', 'adapter stopped').catch(() => {});
  }

  async connectLoop() {
    while (!this.stopped) {
      try {
        await this.provider.connect();
        this.connected = true;
        this.backoff = 500;
        await this.provider.subscribe(this.symbols);
        await this.reportState(this.entitlementState(), 'connected');
        this.log('connected', this.provider.name, 'entitlement', this.provider.entitlement);
        // consume until the socket closes / errors
        for await (const msg of this.provider.messages()) {
          if (this.stopped) break;
          this.onMessage(msg);
        }
        this.connected = false;
        if (!this.stopped) { await this.reportState('DISCONNECTED', 'socket closed'); }
      } catch (e) {
        this.connected = false;
        await this.reportState('DISCONNECTED', 'connect failed: ' + (e && e.message || e)).catch(() => {});
        this.log('connect failed', e && e.message);
      }
      if (this.stopped) break;
      const wait = Math.min(this.o.maxBackoffMs, this.backoff) * (0.7 + Math.random() * 0.6); // jitter
      this.backoff = Math.min(this.o.maxBackoffMs, this.backoff * 2);
      await sleep(wait);
    }
  }

  // ---- ingest one provider message ----
  // Expected normalized shape from the ProviderClient: { symbol, last?, bid?, ask?, session_volume?, event_time (ms epoch or ISO), seq?, halted? }
  onMessage(m) {
    if (!m || !m.symbol) return;
    const symbol = String(m.symbol).toUpperCase();
    if (!this.symbols.includes(symbol)) return;
    const seq = m.seq == null ? null : Number(m.seq);
    if (seq != null) {
      const prev = this.lastSeq.get(symbol);
      if (prev != null) {
        if (seq <= prev) { this.stats.dropped_dupes++; return; }           // duplicate or out-of-order: drop
        if (seq > prev + 1) this.stats.gaps++;                             // a gap in the sequence
      }
      this.lastSeq.set(symbol, seq);
    }
    const eventMs = m.event_time == null ? null : (typeof m.event_time === 'number' ? m.event_time : Date.parse(m.event_time));
    const recv = this.now();
    if (eventMs != null) {
      const lag = recv - eventMs;
      if (lag >= 0 && lag < 3600000) { this.lags.push(lag); if (this.lags.length > this.o.lagWindow) this.lags.shift(); }
    }
    const flags = ['replay'].filter(() => this.provider.replay);
    if (m.halted) flags.push('halted');
    // coalesce: keep only the newest per symbol; merge fields so a trade-only and a quote-only message combine
    const prevQ = this.buffer.get(symbol) || {};
    this.buffer.set(symbol, {
      symbol,
      last: m.last != null ? m.last : prevQ.last,
      bid: m.bid != null ? m.bid : prevQ.bid,
      ask: m.ask != null ? m.ask : prevQ.ask,
      session_volume: m.session_volume != null ? m.session_volume : prevQ.session_volume,
      provider: this.provider.name,
      dataset: m.dataset || this.provider.dataset,
      event_time: eventMs != null ? new Date(eventMs).toISOString() : (prevQ.event_time || null),
      received_at: new Date(recv).toISOString(),
      entitlement_delay_s: this.provider.entitlementDelayS,
      state: m.halted ? 'HALTED' : this.entitlementState(),
      quality_flags: flags,
      source_seq: seq,
    });
    this.stats.messages++;
    this.stats.messagesSinceHeartbeat++;
  }

  entitlementState() {
    if (!this.connected) return 'DISCONNECTED';
    return this.provider.entitlement === 'real-time' ? 'LIVE' : 'DELAYED';
  }

  // ---- flush the coalesced buffer as one batch ----
  async flush() {
    if (!this.buffer.size) return { rows: 0 };
    const rows = Array.from(this.buffer.values());
    this.buffer.clear();
    try {
      const res = await this.rpc('iris_md_quotes_upsert', { p_token: this.o.token, p_rows: rows });
      this.stats.flushes++;
      return res;
    } catch (e) {
      // on failure, put the newest-per-symbol back so nothing is silently lost, but never grow unbounded
      for (const r of rows) if (!this.buffer.has(r.symbol)) this.buffer.set(r.symbol, r);
      this.stats.flush_errors++;
      throw e;
    }
  }

  // ---- heartbeat: connection health + measured lag percentiles ----
  async heartbeat() {
    const rate = this.stats.messagesSinceHeartbeat;
    this.stats.messagesSinceHeartbeat = 0;
    const per1m = Math.round(rate * (60000 / this.o.heartbeatMs));
    await this.reportState(this.connected ? this.entitlementState() : 'DISCONNECTED', null, per1m);
  }

  async reportState(state, note, per1m) {
    const sorted = [...this.lags].sort((a, b) => a - b);
    const body = {
      provider: this.provider ? this.provider.name : null,
      transport: 'websocket',
      connected: this.connected,
      last_heartbeat_at: new Date(this.now()).toISOString(),
      last_message_at: this.stats.messages ? undefined : null,
      entitlement: this.provider ? this.provider.entitlement : 'none',
      symbols_subscribed: this.symbols.length,
      messages_1m: per1m,
      gaps_detected: this.stats.gaps,
      p50_lag_ms: quantile(sorted, 0.5), p95_lag_ms: quantile(sorted, 0.95), p99_lag_ms: quantile(sorted, 0.99),
      state,
      note: this.provider && this.provider.replay ? 'REPLAY — not a live market feed' : note,
    };
    return this.rpc('iris_md_feed_state', { p_token: this.o.token, p_feed: this.o.feed, p_state: body }).catch((e) => this.log('feed_state error', e.message));
  }

  async rpc(fn, body) {
    return this.post(this.o.supabaseUrl + '/rest/v1/rpc/' + fn, body, {
      apikey: this.o.anonKey, Authorization: 'Bearer ' + this.o.anonKey, 'Content-Type': 'application/json',
    });
  }
}

// ---- a real HTTP POST (node:https), used outside tests ----
function httpPost(url, body, headers) {
  const https = require('https');
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({ method: 'POST', hostname: u.hostname, path: u.pathname + u.search, headers: { ...headers, 'Content-Length': Buffer.byteLength(payload) } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({ raw: data }); } });
    });
    req.on('error', reject);
    req.write(payload); req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- a ProviderClient that replays an ndjson fixture (one normalized message per line) ----
// Drives the identical pipeline as a live client, so the tests exercise dedupe/gap/coalesce/flush for real.
class ReplayClient {
  constructor({ lines = [], entitlement = 'delayed-15m', entitlementDelayS = 900, loop = false, intervalMs = 0 } = {}) {
    this.name = 'replay'; this.dataset = 'replay/quotes'; this.replay = true;
    this.entitlement = entitlement; this.entitlementDelayS = entitlementDelayS;
    this.lines = lines; this.loop = loop; this.intervalMs = intervalMs; this._closed = false;
  }
  async connect() { this._closed = false; }
  async subscribe() {}
  async close() { this._closed = true; }
  async *messages() {
    do {
      for (const ln of this.lines) {
        if (this._closed) return;
        if (this.intervalMs) await sleep(this.intervalMs);
        if (typeof ln === 'string') { const t = ln.trim(); if (t) yield JSON.parse(t); }
        else yield ln;
      }
    } while (this.loop && !this._closed);
  }
}

module.exports = { MarketStream, ReplayClient, quantile, httpPost };
