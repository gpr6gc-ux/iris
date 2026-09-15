// iris2_station() → { stations[], recent_runs[], consent_pending[], consent_decided_7d, as_of }
//
// Mirrors iris.stations + the spine filter in the real RPC. One station, online, headless, on the default
// sidecar port. The pairing token here is the test token of the sandbox sidecar so the preview's direct
// lane can actually LINK when a sidecar runs locally with IRIS_PAIRING_TOKEN set to it; against a real
// station the token is whatever its heartbeat published, and the page never shows it.
import { ok } from './_state.js';

const now = Date.now();
const iso = (secAgo) => new Date(now - secAgo * 1000).toISOString();

export function station() {
  return ok({
    stations: [{
      id: 'st-b5517a2213d4ea90',
      name: 'desktop-d48qbh0',
      platform: 'win32',
      host: '127.0.0.1',
      port: 8790,
      version: { harness: 'v0.11.0', node: '22.11.0' },
      pairing_token: 'testpairtoken123456789012345678901234',
      capabilities: ['terminal', 'files', 'mcp', 'consent', 'cron', 'night-shift', 'e-stop'],
      status: { pid: 18244, started_at: iso(5 * 3600 + 420), uptime_s: 5 * 3600 + 420, halted: false, runs_live: 0, spent_today: 0.42 },
      headless: true,
      first_seen_at: iso(3 * 86400),
      last_seen_at: iso(41),
      online: true,
    }],
    recent_runs: [
      { at: iso(41), type: 'station.heartbeat', actor: 'station:st-b5517a2213d4ea90', detail: 'online · 0 live runs · e-stop clear', correlation_id: null },
      { at: iso(2 * 3600 + 600), type: 'station.run.done', actor: 'station:st-b5517a2213d4ea90', detail: 'night-shift: repo hygiene on IRIS-Station — 3 files touched, tests green', correlation_id: null },
      { at: iso(2 * 3600 + 3400), type: 'station.consent.decided', actor: 'station:st-b5517a2213d4ea90', detail: 'allow once · write outside the project folder', correlation_id: null },
      { at: iso(3 * 86400), type: 'station.registered', actor: 'station:st-b5517a2213d4ea90', detail: 'desktop-d48qbh0 (win32) paired with the Command Center', correlation_id: null },
    ],
    consent_pending: [],
    consent_decided_7d: 3,
    as_of: iso(0),
  });
}
