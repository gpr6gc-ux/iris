// Client configuration. Only PUBLIC values live here: the Supabase project URL and its publishable (anon-equivalent) key,
// which is designed to ship in browsers. Everything sensitive stays behind Supabase Auth + RLS + SECURITY DEFINER RPCs.

export const CONFIG = {
  SUPABASE_URL: 'https://ssuikijiaulfhfxzwrgu.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_rttqkBxH9JtJ2hYLwAfnng_bgOwXCaL',
  REALTIME_CHANNEL: 'iris:stream',
  MODELLENS_WEB_URL: 'https://modellens.netlify.app',
  RPC_VERSION: '2.0',
  APP_VERSION: '5.0.0',
  RPC_TIMEOUT_MS: 25000,
  STREAM_POLL_MS: 30000,
  KPI_REFRESH_MS: 120000,
};
