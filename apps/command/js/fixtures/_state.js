// Shared, mutable preview state + time helpers. Timestamps are relative to "now" so ages always look fresh.

export const NOW = () => Date.now();
export const ago = (spec) => {
  // spec: '8m' | '2h' | '3d' | '90s' | number of seconds
  let s = 0;
  if (typeof spec === 'number') s = spec;
  else { const m = String(spec).match(/^(\d+(?:\.\d+)?)([smhd])$/); if (m) s = Number(m[1]) * ({ s: 1, m: 60, h: 3600, d: 86400 }[m[2]]); }
  return new Date(NOW() - s * 1000).toISOString();
};
export const ahead = (spec) => { const t = new Date(ago(spec)); return new Date(2 * NOW() - t.getTime()).toISOString(); };
export const day = (offsetDays) => { const d = new Date(NOW() + offsetDays * 86400000); return d.toISOString().slice(0, 10); };

/** Per-session mutable state (resets on reload). */
export const STATE = {
  decided: new Map(),        // id -> {kind, decision, at}
  channels: {},              // channel_key -> auto_publish
  buyBoxPatch: {},
  screen: { max_ps: 1, max_pb: 2, max_pe: 25, limit: 40 },
  tokens: [],                // rotated tokens added in-session
  revoked: new Set(),
  security: {},              // id -> status
  imports: [],               // imported bundles
  tells: [],
};

export const isDecided = (id) => STATE.decided.has(id);
export const decide = (kind, id, decision, note = '') => { STATE.decided.set(id, { kind, decision, note, at: new Date().toISOString() }); return { kind, id, status: statusFor(kind, decision) }; };
export function statusFor(kind, decision) {
  if (kind === 'proposal') return decision === 'approve' ? 'approved' : 'declined';
  if (kind === 'content') return decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'held';
  if (kind === 'claim') return decision === 'accept' ? 'accepted' : decision === 'dismiss' ? 'dismissed' : 'kept';
  if (kind === 'build') return decision === 'approve' ? 'approved' : 'declined';
  return decision;
}
export const ok = (data) => ({ ok: true, data, meta: { as_of: new Date().toISOString(), took_ms: 12, version: '2.0' } });
export const fail = (code, message) => ({ ok: false, error: { code, message }, meta: { as_of: new Date().toISOString(), took_ms: 4, version: '2.0' } });
