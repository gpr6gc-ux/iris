// UI primitives shared with ModelLens Web: toasts, dialogs, slide-over panel (the 480px drawer), popovers, tooltips, focus trapping.
// Difference from ModelLens: tooltips take DOM content (no innerHTML), and there is a bottom sheet for the Tell IRIS bar.

import { h, $, $$, clear, uid } from './util.js';
import { iconEl } from './icons.js';

const overlays = () => $('#overlays');
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const openStack = [];

function trapFocus(container) {
  const onKey = (e) => {
    if (e.key !== 'Tab') return;
    const f = $$(FOCUSABLE, container).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0]; const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  container.addEventListener('keydown', onKey);
  return () => container.removeEventListener('keydown', onKey);
}

/** Generic layer: backdrop + content; returns { close, el }. */
function openLayer(content, { wrapClass = '', onClose, closeOnBackdrop = true, restoreFocus = true, initialFocus = null } = {}) {
  const prev = document.activeElement;
  const ov = h('div.overlay', { class: wrapClass, role: 'presentation' }, content);
  overlays().appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('show'));
  const untrap = trapFocus(ov);
  let closed = false;
  const close = (result) => {
    if (closed) return; closed = true;
    untrap();
    ov.classList.remove('show');
    const i = openStack.indexOf(entry); if (i >= 0) openStack.splice(i, 1);
    setTimeout(() => ov.remove(), 240);
    onClose && onClose(result);
    if (restoreFocus && prev && typeof prev.focus === 'function' && document.contains(prev)) prev.focus();
  };
  const entry = { close, el: ov };
  openStack.push(entry);
  if (closeOnBackdrop) ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  setTimeout(() => { const f = initialFocus || $$(FOCUSABLE, ov).find((el) => !el.classList.contains('icon-btn')) || $(FOCUSABLE, ov); f && f.focus({ preventScroll: true }); }, 30);
  return entry;
}

export function closeTop() { const top = openStack[openStack.length - 1]; if (top) { top.close(); return true; } return false; }
export const hasOpenLayer = () => openStack.length > 0;

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openStack.length) { e.preventDefault(); closeTop(); } });

// ---------------------------------------------------------------- dialogs
export function openDialog({ title, sub, body, actions = [], glow = false, wide = false, onClose } = {}) {
  const closeBtn = h('button.icon-btn', { type: 'button', 'aria-label': 'Close', onclick: () => entry.close() }, iconEl('close'));
  const head = h('div.panel-head', h('div', h('h2', { id: 'dlg-' + uid() }, title), sub ? h('div.sub', sub) : null), closeBtn);
  const bodyEl = h('div.panel-body', body);
  const btns = actions.map((a) => {
    const b = h('button.btn', { class: a.class || '', type: 'button' }, a.icon ? iconEl(a.icon) : null, a.label);
    b.addEventListener('click', async () => {
      if (a.onClick) {
        b.disabled = true;
        try { const r = await a.onClick(b); if (a.close !== false && r !== false) entry.close(r); }
        catch (err) { console.error(err); }
        finally { b.disabled = false; }
      } else if (a.close !== false) entry.close();
    });
    return b;
  });
  const foot = btns.length ? h('div.panel-foot', btns) : null;
  const dlg = h('div.dialog', { class: `${glow ? 'glow' : ''} ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': head.querySelector('h2').id, tabindex: '-1' }, head, bodyEl, foot);
  const entry = openLayer(dlg, { wrapClass: 'dialog-wrap', onClose, initialFocus: dlg });
  return { ...entry, body: bodyEl, buttons: btns };
}

export function confirmDialog({ title, message, confirmText = 'Continue', cancelText = 'Cancel', danger = false, glow = false, body = null, icon = null }) {
  return new Promise((resolve) => {
    let result = false;
    openDialog({
      title, glow,
      body: h('div.stack', typeof message === 'string' ? h('p', { style: { fontSize: '13.5px', lineHeight: '1.55' } }, message) : message, body),
      actions: [
        { label: cancelText, class: 'btn-ghost' },
        { label: confirmText, class: danger ? 'btn-danger' : 'btn-primary', icon, onClick: () => { result = true; } },
      ],
      onClose: () => resolve(result),
    });
  });
}

/** Prompt for a short note. Resolves to the string, or null when cancelled. */
export function promptDialog({ title, message, label = 'Note', placeholder = '', confirmText = 'Continue', danger = false, required = false }) {
  return new Promise((resolve) => {
    let result = null;
    const ta = h('textarea.input', { rows: 3, placeholder, 'aria-label': label });
    openDialog({
      title,
      body: h('div.stack', message ? h('p', { style: { fontSize: '13.5px', lineHeight: '1.55' } }, message) : null, h('div.field', h('label', label), ta)),
      actions: [
        { label: 'Cancel', class: 'btn-ghost' },
        { label: confirmText, class: danger ? 'btn-danger' : 'btn-primary', onClick: () => { const v = ta.value.trim(); if (required && !v) { ta.focus(); return false; } result = v; } },
      ],
      onClose: () => resolve(result),
    });
    setTimeout(() => ta.focus(), 60);
  });
}

// ---------------------------------------------------------------- slide-over (the 480px right drawer)
let panelEntry = null;
export function openPanel({ title, sub, body, foot, kicker, onClose } = {}) {
  if (panelEntry) { panelEntry.close(); panelEntry = null; }
  const closeBtn = h('button.icon-btn', { type: 'button', 'aria-label': 'Close panel', onclick: () => entry.close() }, iconEl('close'));
  const head = h('div.panel-head', h('div', { style: { minWidth: 0, flex: 1 } }, kicker ? h('div.kicker', kicker) : null, h('h2', title), sub ? h('div.sub', sub) : null), closeBtn);
  const bodyEl = h('div.panel-body', body);
  const footEl = foot ? h('div.panel-foot', foot) : null;
  const panel = h('div.panel', { role: 'dialog', 'aria-modal': 'true', 'aria-label': typeof title === 'string' ? title : 'Details', tabindex: '-1' }, head, bodyEl, footEl);
  const entry = openLayer(panel, { onClose: (r) => { if (panelEntry === entry) panelEntry = null; onClose && onClose(r); }, initialFocus: panel });
  panelEntry = entry;
  return {
    ...entry, body: bodyEl, foot: footEl,
    setTitle: (t, s) => { head.querySelector('h2').textContent = t; const se = head.querySelector('.sub'); if (se && s != null) { clear(se); se.append(s); } },
  };
}
export function closePanel() { if (panelEntry) panelEntry.close(); }
export const isPanelOpen = () => !!panelEntry;

// ---------------------------------------------------------------- bottom sheet (Tell IRIS, phone "More" menu)
let sheetEntry = null;
export function openSheet({ title, body, foot, onClose, cls = '' } = {}) {
  if (sheetEntry) { sheetEntry.close(); sheetEntry = null; }
  const closeBtn = h('button.icon-btn', { type: 'button', 'aria-label': 'Close', onclick: () => entry.close() }, iconEl('close'));
  const sheet = h('div.sheet', { class: cls, role: 'dialog', 'aria-modal': 'true', 'aria-label': typeof title === 'string' ? title : 'Sheet', tabindex: '-1' },
    h('div.sheet-head', h('h2', title), closeBtn), h('div.sheet-body', body), foot ? h('div.sheet-foot', foot) : null);
  const entry = openLayer(sheet, { wrapClass: 'sheet-wrap', onClose: (r) => { if (sheetEntry === entry) sheetEntry = null; onClose && onClose(r); }, initialFocus: sheet });
  sheetEntry = entry;
  return entry;
}
export function closeSheet() { if (sheetEntry) sheetEntry.close(); }
export const isSheetOpen = () => !!sheetEntry;

// ---------------------------------------------------------------- popover
let popState = null;
export function openPopover(anchor, content, { placement = 'bottom-start', cls = '', onClose } = {}) {
  closePopover();
  const pop = h('div.popover', { class: cls, role: 'dialog' }, content);
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth; const ph = pop.offsetHeight;
  let x = r.left; let y = r.bottom + 6;
  if (placement.startsWith('top')) y = r.top - ph - 6;
  if (placement.startsWith('right')) { x = r.right + 8; y = r.top; }
  if (placement.endsWith('end')) x = r.right - pw;
  x = Math.max(8, Math.min(x, window.innerWidth - pw - 8));
  y = Math.max(8, Math.min(y, window.innerHeight - ph - 8));
  pop.style.left = `${x}px`; pop.style.top = `${y}px`;
  const onDoc = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) closePopover(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePopover(); anchor.focus(); } };
  setTimeout(() => { document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey, true); }, 0);
  popState = { pop, anchor, onDoc, onKey, onClose };
  anchor.setAttribute('aria-expanded', 'true');
  setTimeout(() => { const f = $(FOCUSABLE, pop); f && f.focus(); }, 20);
  return pop;
}
export function closePopover() {
  if (!popState) return;
  const { pop, anchor, onDoc, onKey, onClose } = popState;
  document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey, true);
  pop.remove(); anchor.setAttribute('aria-expanded', 'false'); popState = null;
  onClose && onClose();
}
export const isPopoverOpen = () => !!popState;

// ---------------------------------------------------------------- toasts (aria-live region lives in index.html)
export function toast({ title, message, kind = 'info', duration = 4200, action } = {}) {
  const box = $('#toasts');
  const ic = kind === 'success' ? 'check-circle' : kind === 'error' ? 'x-circle' : kind === 'warn' ? 'alert' : 'info';
  const el = h('div.toast', { class: kind, role: 'status' },
    iconEl(ic),
    h('div', h('div.t', title), message ? h('div.m', message) : null, action ? h('button.btn.btn-xs', { type: 'button', style: { marginTop: '8px' }, onclick: () => { action.onClick(); remove(); } }, action.label) : null),
    h('button.icon-btn.sm', { type: 'button', 'aria-label': 'Dismiss', onclick: () => remove() }, iconEl('close')));
  box.appendChild(el);
  let t = duration > 0 ? setTimeout(remove, duration) : null;
  function remove() { if (t) clearTimeout(t); el.classList.add('leaving'); setTimeout(() => el.remove(), 160); }
  el.addEventListener('mouseenter', () => { if (t) clearTimeout(t); t = null; });
  el.addEventListener('mouseleave', () => { if (duration > 0) t = setTimeout(remove, 1800); });
  /** update(title, message, kind) lets a caller turn "working…" into the outcome. */
  const update = (t2, m2, k2) => { if (t2 != null) el.querySelector('.t').textContent = t2; if (m2 != null) { let m = el.querySelector('.m'); if (!m) { m = h('div.m'); el.querySelector('.t').after(m); } m.textContent = m2; } if (k2) { el.classList.remove('info', 'success', 'error', 'warn'); el.classList.add(k2); const icn = k2 === 'success' ? 'check-circle' : k2 === 'error' ? 'x-circle' : k2 === 'warn' ? 'alert' : 'info'; el.querySelector('.ic').replaceWith(iconEl(icn)); } if (t) { clearTimeout(t); t = setTimeout(remove, duration); } };
  return { remove, update };
}

// ---------------------------------------------------------------- tooltip (DOM content, no HTML strings)
let tipEl = null;
export function showTooltip(content, x, y) {
  if (!tipEl) { tipEl = h('div.tooltip', { role: 'tooltip' }); document.body.appendChild(tipEl); }
  clear(tipEl);
  if (typeof content === 'string') tipEl.textContent = content; else tipEl.append(content);
  const w = tipEl.offsetWidth; const hh = tipEl.offsetHeight;
  let left = x + 14; let top = y + 14;
  if (left + w > window.innerWidth - 8) left = x - w - 14;
  if (top + hh > window.innerHeight - 8) top = y - hh - 14;
  tipEl.style.left = `${left}px`; tipEl.style.top = `${top}px`;
  tipEl.classList.add('show');
}
export function hideTooltip() { if (tipEl) tipEl.classList.remove('show'); }
export function bindTooltip(el, contentFn) {
  const get = () => (typeof contentFn === 'function' ? contentFn() : contentFn);
  el.addEventListener('mousemove', (e) => showTooltip(get(), e.clientX, e.clientY));
  el.addEventListener('mouseleave', hideTooltip);
  el.addEventListener('focus', () => { const r = el.getBoundingClientRect(); showTooltip(get(), r.left, r.bottom); });
  el.addEventListener('blur', hideTooltip);
}

// ---------------------------------------------------------------- small building blocks
export const pill = (text, cls = '') => h('span.pill', { class: cls }, h('span.txt', text));
/** Severity pill: shape + colour (never colour alone). Accepts high|medium|low|info|critical in any case. */
export const sevPill = (sev, label) => pill(label || String(sev || 'info').toLowerCase(), `sev-${String(sev || 'INFO').toUpperCase()}`);
export function emptyState(title, text, action) { return h('div.empty', h('strong', title), text ? h('div', text) : null, action ? h('div', { style: { marginTop: '10px' } }, action) : null); }
export function errorState(err, retry) {
  const code = err && err.code ? String(err.code) : 'error';
  const msg = err && err.message ? String(err.message) : String(err || 'Something went wrong.');
  const hint = code === 'not_found' ? 'The backend function is not deployed yet. This page will work as soon as the RPC v2 migration lands.'
    : code === 'forbidden' ? 'Your account is not on the owner allow-list for this call.'
    : code === 'unauthenticated' ? 'Your session has ended. Sign in again.'
    : code === 'timeout' ? 'The database took too long. Retry in a moment.'
    : code === 'network' ? 'Could not reach Supabase. Check the connection and retry.'
    : 'Retry, or check the audit log if this keeps happening.';
  return h('div.error-box', { role: 'alert' },
    h('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start' } }, iconEl('alert'), h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { style: { fontWeight: 600 } }, `Could not load · ${code}`), h('div.small', { style: { marginTop: '2px' } }, msg), h('div.small.muted', { style: { marginTop: '4px' } }, hint)),
      retry ? h('button.btn.btn-sm', { type: 'button', onclick: retry }, iconEl('refresh'), 'Retry') : null));
}
export function skeleton(cls) { return h('div.skel', { class: cls, 'aria-hidden': 'true' }); }
export function cardHead(title, meta, tag = 'h2') { return h('div.card-head', h(tag, title), meta ? h('div.meta', meta) : null); }
/** Segmented control. items: [{key, label, count}], onChange(key) */
export function segmented(items, active, onChange, { label = 'View' } = {}) {
  const seg = h('div.seg', { role: 'tablist', 'aria-label': label });
  for (const it of items) {
    const b = h('button', { type: 'button', role: 'tab', 'aria-selected': it.key === active ? 'true' : 'false', 'aria-pressed': it.key === active ? 'true' : 'false', dataset: { key: it.key } }, it.label, it.count != null ? h('span.cnt', String(it.count)) : null);
    b.addEventListener('click', () => { $$('button', seg).forEach((x) => { const on = x === b; x.setAttribute('aria-pressed', on ? 'true' : 'false'); x.setAttribute('aria-selected', on ? 'true' : 'false'); }); onChange(it.key); });
    seg.append(b);
  }
  return seg;
}
export function stat(k, v, sub, cls = '') { return h('div.mini-stat', { class: cls }, h('div.k', k), h('div.v.num', v), sub ? h('div.s', sub) : null); }
export function kv(k, v) { return h('div.kv', h('div.k', k), h('div.v', v)); }
export function bar(pct, tone = '') { return h('div.bar', { role: 'img', 'aria-label': `${Math.round(pct)}%` }, h('i', { class: tone, style: { width: `${Math.max(0, Math.min(100, Number(pct) || 0))}%` } })); }
export function steps(list) { return h('div.steps', (list || []).map((s, i) => h('div', h('span.n', String(i + 1)), h('span', s)))); }
export function switchEl(checked, onChange, { label = '', disabled = false } = {}) {
  const input = h('input', { type: 'checkbox', role: 'switch', 'aria-checked': checked ? 'true' : 'false', 'aria-label': label, disabled });
  input.checked = !!checked;
  input.addEventListener('change', async () => {
    const next = input.checked; input.disabled = true; input.setAttribute('aria-checked', next ? 'true' : 'false');
    try { const ok = await onChange(next); if (ok === false) { input.checked = !next; input.setAttribute('aria-checked', !next ? 'true' : 'false'); } }
    finally { input.disabled = disabled; }
  });
  return h('label.switch', input, h('span.track'));
}
