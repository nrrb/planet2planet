/**
 * Map colours. The map is drawn on a dark "space" canvas in both site themes, so these are
 * tuned for a dark background. Layers also differ by line style, so colour is never the only cue.
 */
export const MAP_BACKGROUND = '#060b16';
export const MAP_TEXT = '#e8eef9';
export const MAP_MUTED = '#8d9bb5';
export const MAP_ACCENT = '#ffd27a';

export interface LayerStyle {
  label: string;
  color: string;
  /** Dash and gap lengths in px; null is a solid line. */
  dash: [number, number] | null;
  width: number;
}

export const LAYER_STYLES: Record<string, LayerStyle> = {
  access: { label: 'Access', color: '#3fd0bd', dash: [2, 5], width: 2 },
  mesh: { label: 'Regional mesh', color: '#6ea0ff', dash: null, width: 1.5 },
  backbone: { label: 'Backbone', color: '#b18cff', dash: null, width: 2.5 },
  cross: { label: 'Cross-link', color: '#ff86b4', dash: [10, 6], width: 2 },
  conjunction: { label: 'Conjunction reroute', color: '#ffbf55', dash: [3, 8], width: 2 },
};
export const LAYER_ORDER = ['access', 'mesh', 'backbone', 'cross', 'conjunction'] as const;

const BODY_COLORS: Record<string, string> = {
  sun: '#ffdc55',
  mercury: '#a7a9ac',
  venus: '#ead7ae',
  earth: '#4d9fff',
  mars: '#e77b51',
  jupiter: '#d6b18d',
  saturn: '#ead19a',
  uranus: '#8bdfe1',
  neptune: '#557ce8',
  ceres: '#b7aaa0',
  pluto: '#d2b9a3',
  haumea: '#dfe3ea',
  makemake: '#d99c7a',
  eris: '#e6e8ee',
  moon: '#c8cbd2',
  io: '#e3c35d',
  europa: '#cfc1a7',
  ganymede: '#a89d8d',
  callisto: '#8c8680',
  mimas: '#c3c5c8',
  enceladus: '#e3edf1',
  tethys: '#cdd4d6',
  dione: '#c4c7c2',
  rhea: '#bab8b2',
  titan: '#d9a956',
  iapetus: '#9f9589',
  miranda: '#c2c4c6',
  ariel: '#d1d6d5',
  umbriel: '#85898f',
  titania: '#b7b4ad',
  oberon: '#a59c96',
  triton: '#c8d4ce',
  charon: '#a9a39d',
  dysnomia: '#8f94a0',
};

export const bodyColor = (id: string): string => BODY_COLORS[id] ?? '#c8cbd2';
