// Inline SVG icon set: 16px grid, 1.5px stroke, round caps. The ModelLens Web set plus the IRIS domain icons from the
// design canvas (build.py), drawn in the same style. No emoji anywhere in the UI.

const PATHS = {
  // ---- ModelLens Web set (shared)
  overview: '<rect x="2" y="2" width="5" height="5" rx="1.2"/><rect x="9" y="2" width="5" height="5" rx="1.2"/><rect x="2" y="9" width="5" height="5" rx="1.2"/><rect x="9" y="9" width="5" height="5" rx="1.2"/>',
  findings: '<path d="M6 4h8M6 8h8M6 12h8"/><circle cx="2.8" cy="4" r=".9" fill="currentColor" stroke="none"/><circle cx="2.8" cy="8" r=".9" fill="currentColor" stroke="none"/><circle cx="2.8" cy="12" r=".9" fill="currentColor" stroke="none"/>',
  explore: '<circle cx="8" cy="8" r="6"/><path d="M10.5 5.5L9 9l-3.5 1.5L7 7z"/>',
  ask: '<path d="M3 3h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7.5L4.5 13.5V11H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>',
  review: '<path d="M8 1.8l5 1.9v4c0 3-2.1 5.2-5 6.3-2.9-1.1-5-3.3-5-6.3v-4z"/><path d="M5.6 8.1l1.7 1.7 3.2-3.4"/>',
  methodology: '<path d="M3 2.5h10a.5.5 0 0 1 .5.5v10a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5z"/><path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3"/>',
  search: '<circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2L14 14"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  'chevron-down': '<path d="M4 6l4 4 4-4"/>',
  'chevron-up': '<path d="M4 10l4-4 4 4"/>',
  'chevron-right': '<path d="M6 4l4 4-4 4"/>',
  'chevron-left': '<path d="M10 4L6 8l4 4"/>',
  sun: '<circle cx="8" cy="8" r="2.8"/><path d="M8 1.5v1.7M8 12.8v1.7M1.5 8h1.7M12.8 8h1.7M3.4 3.4l1.2 1.2M11.4 11.4l1.2 1.2M3.4 12.6l1.2-1.2M11.4 4.6l1.2-1.2"/>',
  moon: '<path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z"/>',
  monitor: '<rect x="1.8" y="2.8" width="12.4" height="8" rx="1.2"/><path d="M6 13.5h4M8 10.8v2.7"/>',
  download: '<path d="M8 2.5v8M5 7.5l3 3 3-3M3 13.5h10"/>',
  upload: '<path d="M8 10.5v-8M5 5.5l3-3 3 3M3 13.5h10"/>',
  play: '<path d="M5 3.2l7.5 4.8L5 12.8z" fill="currentColor"/>',
  stop: '<rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor"/>',
  palette: '<path d="M8 1.8s4.3 4.3 4.3 7.6a4.3 4.3 0 0 1-8.6 0C3.7 6.1 8 1.8 8 1.8z"/>',
  info: '<circle cx="8" cy="8" r="6.2"/><path d="M8 7.2v4M8 5.1v.2"/>',
  check: '<path d="M3 8.5l3.2 3L13 4.5"/>',
  'check-circle': '<circle cx="8" cy="8" r="6.2"/><path d="M5.3 8.3l1.9 1.9 3.6-3.9"/>',
  alert: '<path d="M8 2.2l6 10.6H2z"/><path d="M8 6.5v3M8 11.5v.2"/>',
  'x-circle': '<circle cx="8" cy="8" r="6.2"/><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"/>',
  filter: '<path d="M2 3h12l-4.7 5.5v4L6.7 14V8.5z"/>',
  columns: '<rect x="2" y="2.5" width="12" height="11" rx="1.2"/><path d="M6 2.5v11M10 2.5v11"/>',
  modules: '<path d="M8 2l6 3-6 3-6-3z"/><path d="M2 8l6 3 6-3M2 11l6 3 6-3"/>',
  item: '<path d="M2.5 4h11M2.5 8h7M2.5 12h5"/>',
  graph: '<circle cx="3" cy="8" r="1.6"/><circle cx="13" cy="4" r="1.6"/><circle cx="13" cy="12" r="1.6"/><path d="M4.5 7.3l7-2.7M4.5 8.7l7 2.7"/>',
  copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.2"/><path d="M10.5 5.5V3.7a1.2 1.2 0 0 0-1.2-1.2H3.7a1.2 1.2 0 0 0-1.2 1.2v5.6a1.2 1.2 0 0 0 1.2 1.2h1.8"/>',
  refresh: '<path d="M13.5 8a5.5 5.5 0 0 1-9.6 3.6M2.5 8a5.5 5.5 0 0 1 9.6-3.6"/><path d="M12.5 1.8v2.8H9.7M3.5 14.2v-2.8h2.8"/>',
  sidebar: '<rect x="2" y="2.5" width="12" height="11" rx="1.2"/><path d="M6 2.5v11"/>',
  sparkles: '<path d="M8 2l1.5 3.6L13 7l-3.5 1.4L8 12 6.5 8.4 3 7l3.5-1.4z"/><path d="M12.5 11.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/>',
  'arrow-right': '<path d="M2.5 8h11M9.5 4l4 4-4 4"/>',
  'arrow-left': '<path d="M13.5 8h-11M6.5 4l-4 4 4 4"/>',
  'arrow-up-right': '<path d="M4 12l8-8M5.5 4H12v6.5"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  minus: '<path d="M3 8h10"/>',
  help: '<circle cx="8" cy="8" r="6.2"/><path d="M6.1 6.3a1.9 1.9 0 0 1 3.8.2c0 1.3-1.9 1.4-1.9 2.7M8 11.6v.2"/>',
  keyboard: '<rect x="1.8" y="4" width="12.4" height="8" rx="1.2"/><path d="M4.5 6.8h.2M7 6.8h.2M9.5 6.8h.2M12 6.8h.2M5.5 9.5h5"/>',
  layers: '<path d="M2.5 5.5L8 2.5l5.5 3L8 8.5z"/><path d="M2.5 8.5l5.5 3 5.5-3M2.5 11.5l5.5 3 5.5-3"/>',
  target: '<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r=".6" fill="currentColor"/>',
  zap: '<path d="M9 1.8L3.5 9h4l-.5 5.2L12.5 7h-4z"/>',
  shield: '<path d="M8 1.8l5 1.9v4c0 3-2.1 5.2-5 6.3-2.9-1.1-5-3.3-5-6.3v-4z"/>',
  lock: '<rect x="3.5" y="7" width="9" height="7" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
  file: '<path d="M4 1.8h5l3.5 3.5v8.9a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V2.3a.5.5 0 0 1 .5-.5z"/><path d="M9 1.8v3.5h3.5"/>',
  external: '<path d="M7 3H3.5a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V9"/><path d="M9.5 2.5H13.5v4M13.5 2.5L7.5 8.5"/>',
  clock: '<circle cx="8" cy="8" r="6.2"/><path d="M8 4.5V8l2.3 1.5"/>',
  dollar: '<path d="M8 1.8v12.4"/><path d="M10.8 5A2.6 2.6 0 0 0 8.2 3.4H7.6a2.3 2.3 0 0 0 0 4.6h.8a2.3 2.3 0 0 1 0 4.6h-.6A2.6 2.6 0 0 1 5.2 11"/>',
  table: '<rect x="2" y="2.5" width="12" height="11" rx="1.2"/><path d="M2 6.5h12M2 10h12M6.5 6.5v7"/>',
  trash: '<path d="M2.5 4h11M6 4V2.8h4V4M4 4l.6 9.2h6.8L12 4"/>',
  dot: '<circle cx="8" cy="8" r="2.5" fill="currentColor"/>',
  send: '<path d="M13.5 2.5L2.5 6.8l5 1.7 1.7 5z"/><path d="M13.5 2.5L7.5 8.5"/>',
  book: '<path d="M2.5 3.2c2-.9 4-.9 5.5.2 1.5-1.1 3.5-1.1 5.5-.2v9.4c-2-.9-4-.9-5.5.2-1.5-1.1-3.5-1.1-5.5-.2z"/><path d="M8 3.4v9.4"/>',
  eye: '<path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
  'eye-off': '<path d="M2 2l12 12"/><path d="M6.6 6.7A2 2 0 0 0 9.3 9.4"/><path d="M4.3 4.9C2.6 6 1.5 8 1.5 8s2.5 4.5 6.5 4.5c1.2 0 2.3-.4 3.2-.9M6.6 3.7C7 3.6 7.5 3.5 8 3.5c4 0 6.5 4.5 6.5 4.5s-.7 1.3-2 2.5"/>',
  wand: '<path d="M2.5 13.5l8-8M9 4l2.5 2.5"/><path d="M12.5 1.5l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z"/>',
  // ---- IRIS set (design canvas build.py)
  mission: '<path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3"/><circle cx="8" cy="8" r="3.5"/>',
  inbox: '<path d="M2 9.5h3.2l1 2h3.6l1-2H14"/><path d="M3.3 3.5h9.4l1.3 6v3.5H2V9.5z"/>',
  agents: '<circle cx="8" cy="4" r="2"/><circle cx="3.5" cy="12" r="2"/><circle cx="12.5" cy="12" r="2"/><path d="M6.6 5.6 4.6 10M9.4 5.6l2 4.4M5.5 12h5"/>',
  revenue: '<path d="M2 12.5 6 8l3 3 5-6"/><path d="M10.5 5H14v3.5"/>',
  projects: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2 6.5h12M6 6.5v6.5"/>',
  estate: '<path d="M2.5 8 8 3l5.5 5"/><path d="M4 7v6h8V7"/><path d="M6.5 13V9.5h3V13"/>',
  markets: '<path d="M2 13h12"/><path d="M4 10V6M7 10V3.5M10 10V7.5M13 10V5"/>',
  brain: '<path d="M6 2.5a2.5 2.5 0 0 0-2.4 3.2A2.6 2.6 0 0 0 3 10a2.6 2.6 0 0 0 3 2.8V2.5Z"/><path d="M10 2.5a2.5 2.5 0 0 1 2.4 3.2A2.6 2.6 0 0 1 13 10a2.6 2.6 0 0 1-3 2.8V2.5Z"/>',
  intel: '<circle cx="7" cy="7" r="4"/><path d="m10 10 3.5 3.5"/>',
  money: '<rect x="2" y="4" width="12" height="8.5" rx="1.5"/><circle cx="8" cy="8.25" r="2"/><path d="M4.5 6.5v3.5M11.5 6.5v3.5"/>',
  governance: '<path d="M8 1.8 2.8 4v3.6c0 3.3 2.2 5.6 5.2 6.6 3-1 5.2-3.3 5.2-6.6V4Z"/><path d="m5.8 8 1.6 1.6L10.5 6.5"/>',
  settings: '<circle cx="8" cy="8" r="2"/><path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M3.6 12.4l1.2-1.2M11.2 4.8l1.2-1.2"/>',
  bolt: '<path d="M9 1.5 3.5 9h4L7 14.5 12.5 7h-4z"/>',
  arrow: '<path d="M3 8h10M9 4l4 4-4 4"/>',
  pause: '<path d="M5.5 3v10M10.5 3v10"/>',
  menu: '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/>',
  user: '<circle cx="8" cy="5.5" r="2.7"/><path d="M2.8 14a5.2 5.2 0 0 1 10.4 0"/>',
  db: '<ellipse cx="8" cy="4" rx="5.5" ry="2.2"/><path d="M2.5 4v8c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2V4M2.5 8c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2"/>',
  link: '<path d="M6.5 9.5 9.5 6.5"/><path d="M7 4.5 8.4 3.1a2.6 2.6 0 0 1 3.7 3.7L10.7 8.2M9 11.5l-1.4 1.4a2.6 2.6 0 0 1-3.7-3.7L5.3 7.8"/>',
  map: '<path d="m2 4.5 4-2 4 2 4-2v9l-4 2-4-2-4 2z"/><path d="M6 2.5v9M10 4.5v9"/>',
  wallet: '<path d="M2.5 5.5h11v7.5h-11z"/><path d="M2.5 5.5V4a1 1 0 0 1 1-1h7.5"/><circle cx="10.5" cy="9.25" r=".8"/>',
  mail: '<rect x="2" y="3.5" width="12" height="9" rx="1.5"/><path d="m2.5 4.5 5.5 4.5 5.5-4.5"/>',
  logout: '<path d="M6 13.5H3.5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1H6"/><path d="M10 11l3-3-3-3M13 8H6.5"/>',
  key: '<circle cx="5.5" cy="10.5" r="3"/><path d="m7.6 8.4 5.9-5.9M11 4l2 2M9 6l2 2"/>',
  terminal: '<rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.5"/><path d="m4.5 6 2.5 2-2.5 2M8.5 10.5h3"/>',
  flag: '<path d="M3.5 14V2.5"/><path d="M3.5 3h8.5l-1.6 3 1.6 3H3.5"/>',
  more: '<circle cx="3.5" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="12.5" cy="8" r="1.1" fill="currentColor" stroke="none"/>',
  pin: '<path d="M6 9.5 3 12.5M9.5 2.5 13.5 6.5l-2 .5-3 3-.5 2.5L4.5 9l2.5-.5 3-3z"/>',
  activity: '<path d="M1.5 8h2.5l2-4.5 3 9 2-4.5h3.5"/>',
  compass: '<circle cx="8" cy="8" r="6"/><path d="M10.5 5.5 9 9l-3.5 1.5L7 7z"/>',
  chart: '<path d="M2.5 13.5v-11M2.5 13.5h11"/><path d="m4.5 10.5 3-3.5 2.5 2 3.5-4.5"/>',
  route: '<circle cx="4" cy="12" r="2"/><circle cx="12" cy="4" r="2"/><path d="M12 6v2.5a2 2 0 0 1-2 2H6a2 2 0 0 0-2 2"/>',
};

export function icon(name, cls = '') {
  const d = PATHS[name] || PATHS.dot;
  return `<svg class="ic ${cls}" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${d}</svg>`;
}

export function iconEl(name, cls = '') {
  const t = document.createElement('template');
  t.innerHTML = icon(name, cls);
  return t.content.firstElementChild;
}

export const hasIcon = (name) => Boolean(PATHS[name]);

/** The IRIS glyph: crosshair reticle in a rounded tile — the brand mark from the design canvas. */
export function irisGlyph(size = 30) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
  <defs><linearGradient id="iris-mark-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--primary)"/><stop offset="1" stop-color="color-mix(in oklab, var(--primary) 55%, oklch(65% .16 260))"/></linearGradient></defs>
  <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#iris-mark-grad)"/>
  <g fill="none" stroke="var(--primary-foreground)" stroke-width="1.8" stroke-linecap="round"><path d="M16 6v4M16 22v4M6 16h4M22 16h4"/><circle cx="16" cy="16" r="4.6"/></g>
</svg>`;
}
export function irisGlyphEl(size = 30) { const t = document.createElement('template'); t.innerHTML = irisGlyph(size); return t.content.firstElementChild; }
