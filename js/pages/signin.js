// Sign-in screen (SignIn.dc.html): email + password, magic link, first-time owner account, and the sample-data preview.

import { h, clear } from '../util.js';
import { iconEl, irisGlyphEl } from '../icons.js';
import { signInWithPassword, signUpOwner, sendMagicLink } from '../auth.js';

export function render({ onPreview, onSignedIn }) {
  let mode = 'signin'; // signin | create
  const email = h('input.input.lg', { type: 'email', name: 'email', autocomplete: 'username', placeholder: 'you@example.com', required: true, 'aria-label': 'Email', inputmode: 'email', spellcheck: 'false' });
  const password = h('input.input.lg', { type: 'password', name: 'password', autocomplete: 'current-password', placeholder: '••••••••••••', required: true, 'aria-label': 'Password', minlength: '8' });
  const status = h('div.status', { role: 'alert', hidden: true });
  const submit = h('button.btn.btn-primary.btn-lg', { type: 'submit' }, 'Sign in');
  const magic = h('button.btn.btn-lg', { type: 'button' }, iconEl('bolt'), 'Email me a magic link');
  const toggle = h('button.link-btn', { type: 'button' }, 'First time here? Create the owner account');
  const title = h('h2', 'Welcome back');
  const sub = h('p.sub', 'Sign in to the room. Owners and invited members get in; everyone else is refused.');

  const setStatus = (kind, text) => { clear(status); status.hidden = false; status.className = `status ${kind}`; status.append(iconEl(kind === 'bad' ? 'alert' : kind === 'good' ? 'check-circle' : 'info'), h('span', text)); };
  const busy = (on) => { submit.disabled = on; magic.disabled = on; submit.classList.toggle('busy', on); };
  const setMode = (m) => {
    mode = m;
    const create = m === 'create';
    title.textContent = create ? 'Create the owner account' : 'Welcome back';
    sub.textContent = create ? 'One account, yours. The email must already be on the owner allow-list.' : 'Sign in to the room. Owners and invited members get in; everyone else is refused.';
    submit.textContent = create ? 'Create account' : 'Sign in';
    password.setAttribute('autocomplete', create ? 'new-password' : 'current-password');
    toggle.textContent = create ? 'Already have the account? Sign in' : 'First time here? Create the owner account';
    status.hidden = true;
  };
  toggle.addEventListener('click', () => setMode(mode === 'create' ? 'signin' : 'create'));

  const form = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    const em = email.value.trim(); const pw = password.value;
    if (!em || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { setStatus('bad', 'Enter the owner email address.'); email.focus(); return; }
    if (!pw || pw.length < 8) { setStatus('bad', 'Enter the password (at least 8 characters).'); password.focus(); return; }
    busy(true); status.hidden = true;
    try {
      if (mode === 'create') {
        const d = await signUpOwner(em, pw);
        if (d && d.session) { setStatus('good', 'Account created — opening the room…'); onSignedIn(); }
        else setStatus('good', `Account created. Confirm the email we sent to ${em}, then sign in.`);
      } else {
        await signInWithPassword(em, pw);
        setStatus('good', 'Signed in — checking the owner allow-list…');
        onSignedIn();
      }
    } catch (err) { setStatus('bad', err.message || 'Sign-in failed.'); password.focus(); password.select(); }
    finally { busy(false); }
  } },
    h('div.field', h('label', { for: 'si-email' }, 'Email'), email),
    h('div.field', h('label', { for: 'si-password' }, 'Password'), password),
    status,
    submit);
  email.id = 'si-email'; password.id = 'si-password';

  magic.addEventListener('click', async () => {
    const em = email.value.trim();
    if (!em || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { setStatus('bad', 'Enter your email first, then request the link. Invited members: use the exact email the invitation named.'); email.focus(); return; }
    busy(true);
    try { await sendMagicLink(em); setStatus('good', `Link sent to ${em}. Open it on this device — the session lands back here.`); }
    catch (err) { setStatus('bad', err.message || 'Could not send the link.'); }
    finally { busy(false); }
  });

  const card = h('div.card.auth-card',
    h('div', title, sub),
    form,
    h('div.or', h('i'), h('span.muted.small', 'or'), h('i')),
    magic,
    h('div', { style: { textAlign: 'center' } }, toggle),
    h('div.foot', iconEl('lock'), h('span', 'Sessions persist on this device until you sign out. Every action you take is written to the audit log with your user id.')),
    h('div.divider'),
    h('div.preview-cta', h('button.btn', { type: 'button', onclick: onPreview }, iconEl('eye'), 'Preview with sample data'), h('span.small.muted', 'Opens every page with fixtures. No account, no live calls, and the Money page stays hidden.')));

  const left = h('div.auth-left',
    h('div.ring-deco', { style: { width: '560px', height: '560px', right: '-180px', top: '-160px' } }),
    h('div.ring-deco', { style: { width: '760px', height: '760px', right: '-320px', top: '-200px', opacity: '.6' } }),
    h('div.ring-deco', { style: { width: '480px', height: '480px', left: '-160px', bottom: '-200px', opacity: '.7' } }),
    h('div.brand', h('span.brand-glyph', { 'aria-hidden': 'true' }, irisGlyphEl(40)), h('span.brand-text', h('span.brand-name', 'IRIS Command'), h('span.brand-by', 'Personal operating system · 5.0'))),
    h('div.pitch', h('div.eyebrow', 'Agents draft · you decide · everything audited'), h('h2', 'Run the whole machine from one signed-in room.'), h('p', 'Approvals, agents, revenue lanes, ModelLens audits and the Karta memory — behind a real login. No shared token in the page, no direct calls to automation from the browser.')),
    h('div.stack-note', h('span.live-dot.ok'), h('span', 'Supabase Auth · owner allowlist · RLS · audit log')));

  const el = h('div.auth', { dataset: { signin: '1' } }, left, h('div.auth-right', card));
  setTimeout(() => email.focus(), 80);
  return el;
}
