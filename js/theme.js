// Theme + mode + density application (instant, no reload). Same six hues and three modes as ModelLens Web.
// Persisted in prefs and mirrored to iris.theme / iris.mode for the boot script in index.html.

import { S, setPref, emit } from './store.js';

export const THEMES = [
  { key: 'lens', label: 'Lens', swatch: 'oklch(62% .14 205)' },
  { key: 'indigo', label: 'Indigo', swatch: 'oklch(60% .16 265)' },
  { key: 'forest', label: 'Forest', swatch: 'oklch(60% .14 160)' },
  { key: 'plum', label: 'Plum', swatch: 'oklch(60% .16 295)' },
  { key: 'amber', label: 'Amber', swatch: 'oklch(72% .15 60)' },
  { key: 'graphite', label: 'Graphite', swatch: 'oklch(55% .03 260)' },
];
export const MODES = [
  { key: 'light', label: 'Light', icon: 'sun' },
  { key: 'dark', label: 'Dark', icon: 'moon' },
  { key: 'system', label: 'System', icon: 'monitor' },
];
export const DENSITIES = [
  { key: 'comfortable', label: 'Comfortable' },
  { key: 'compact', label: 'Compact' },
];

export function applyTheme(theme = S.prefs.theme, mode = S.prefs.mode) {
  const r = document.documentElement;
  if (!THEMES.some((t) => t.key === theme)) theme = 'lens';
  if (!MODES.some((m) => m.key === mode)) mode = 'dark';
  r.setAttribute('data-theme', theme);
  if (mode === 'system') { r.removeAttribute('data-mode'); r.classList.add('mode-system'); }
  else { r.setAttribute('data-mode', mode); r.classList.remove('mode-system'); }
  if (S.prefs.theme !== theme) setPref('theme', theme);
  if (S.prefs.mode !== mode) setPref('mode', mode);
  emit('theme', { theme, mode });
}

export function applyDensity(d = S.prefs.density) {
  if (!DENSITIES.some((x) => x.key === d)) d = 'comfortable';
  document.documentElement.setAttribute('data-density', d);
  if (S.prefs.density !== d) setPref('density', d);
}

export const effectiveMode = () => S.prefs.mode === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : S.prefs.mode;
