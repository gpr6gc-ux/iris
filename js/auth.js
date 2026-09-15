// Supabase Auth: one client (UMD build vendored at js/vendor/supabase.js), password + magic-link sign-in, first-time owner
// account creation, session persistence (localStorage via supabase-js) and the redirect-hash handoff (#access_token=…).

import { CONFIG } from './config.js';
import { S, emit } from './store.js';

let client = null;

export function getClient() {
  if (client) return client;
  const lib = window.supabase;
  if (!lib || typeof lib.createClient !== 'function') throw new Error('supabase-js did not load (js/vendor/supabase.js).');
  client = lib.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit', storageKey: 'iris5.auth' },
    realtime: { params: { eventsPerSecond: 10 } },
    global: { headers: { 'x-client-info': `iris-command/${CONFIG.APP_VERSION}` } },
  });
  client.auth.onAuthStateChange((event, session) => {
    S.session = session || null;
    S.user = session?.user ? { id: session.user.id, email: session.user.email || '' } : null;
    emit('auth', { event, session: S.session });
  });
  return client;
}

/** True when the URL carries an auth callback (magic link / confirmation) that supabase-js will consume. */
export function urlHasAuthCallback() {
  const hsh = location.hash || '';
  const q = location.search || '';
  return /(^|[#&?])(access_token|refresh_token|error_description|error_code|type)=/.test(hsh) || /[?&](code|error_description)=/.test(q);
}

/** Resolve the current session (also consumes a redirect hash). Returns the session or null. */
export async function initSession() {
  const sb = getClient();
  const { data: { session } = {} } = await sb.auth.getSession();
  S.session = session || null;
  S.user = session?.user ? { id: session.user.id, email: session.user.email || '' } : null;
  return S.session;
}

export async function signInWithPassword(email, password) {
  const sb = getClient();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw normalize(error);
  return data.session;
}

export async function signUpOwner(email, password) {
  const sb = getClient();
  const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + '/' } });
  if (error) throw normalize(error);
  return data; // {user, session|null} — session is null when email confirmation is on
}

export async function sendMagicLink(email) {
  const sb = getClient();
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + '/' } });
  if (error) throw normalize(error);
  return true;
}

export async function signOut() {
  try { const sb = getClient(); await sb.auth.signOut({ scope: 'local' }); } catch (e) { console.warn('signOut', e); }
  S.session = null; S.user = null; S.owner = null; S.config = null;
  emit('auth', { event: 'SIGNED_OUT', session: null });
}

function normalize(error) {
  const msg = String(error?.message || error || 'Sign-in failed');
  const status = error?.status;
  let friendly = msg;
  if (/invalid login credentials/i.test(msg)) friendly = 'That email and password don’t match.';
  else if (/email not confirmed/i.test(msg)) friendly = 'Confirm your email first — check the inbox for the confirmation link.';
  else if (/rate limit|too many/i.test(msg)) friendly = 'Too many attempts. Wait a minute and try again.';
  else if (/signups? not allowed|disabled/i.test(msg)) friendly = 'Sign-ups are disabled for this project. Ask the owner to create the account.';
  else if (/password should be/i.test(msg)) friendly = 'Password is too short — use at least 8 characters.';
  else if (/user already registered/i.test(msg)) friendly = 'That account already exists. Sign in instead.';
  else if (/fetch|network/i.test(msg)) friendly = 'Could not reach Supabase Auth. Check the connection.';
  const e = new Error(friendly); e.code = status === 400 ? 'invalid' : status === 429 ? 'rate_limited' : 'auth'; e.status = status; e.raw = msg;
  return e;
}
