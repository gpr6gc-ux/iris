// Hash router: #/page/sub/id?param=value

export function parseHash(hash = location.hash) {
  let s = hash.replace(/^#/, '');
  if (!s.startsWith('/')) s = '/' + s;
  const [pathPart, query = ''] = s.split('?');
  const parts = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  return { path: '/' + parts.join('/'), parts, page: parts[0] || 'cortex', params: new URLSearchParams(query) };
}

export function href(path, params) {
  let q = '';
  if (params) {
    const sp = params instanceof URLSearchParams ? params : new URLSearchParams();
    if (!(params instanceof URLSearchParams)) for (const [k, v] of Object.entries(params)) { if (v != null && v !== '' && v !== false) sp.set(k, String(v)); }
    const str = sp.toString();
    if (str) q = '?' + str;
  }
  return '#' + (path.startsWith('/') ? path : '/' + path) + q;
}

export function navigate(path, params, { replace = false } = {}) {
  const target = href(path, params);
  if (target === location.hash) { window.dispatchEvent(new HashChangeEvent('hashchange')); return; }
  if (replace) history.replaceState(null, '', target); else location.hash = target;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** Update query params of the current route without adding a history entry. */
export function setParams(mutator) {
  const r = parseHash();
  mutator(r.params);
  const q = r.params.toString();
  history.replaceState(null, '', '#' + r.path + (q ? '?' + q : ''));
}

export function onRoute(fn) {
  const handler = () => fn(parseHash());
  window.addEventListener('hashchange', handler);
  return handler;
}
