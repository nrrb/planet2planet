/**
 * Map colours. The map is drawn on a dark "space" canvas in both site themes, so these are
 * tuned for a dark background. Layers also differ by line style, so colour is never the only cue.
 */
export type MapTheme = 'dark' | 'light';

export interface MapColors {
  background: string;
  text: string;
  muted: string;
  accent: string;
  /** Orbit paths. */
  track: string;
  trackAlpha: number;
  /** A thin ring round every world so it reads against the background. */
  outline: string;
  outlineAlpha: number;
  /** The bright dashes that travel along links. */
  flow: string;
  /** Link colour by layer, tuned for the background. */
  layers: Record<string, string>;
}

/** The map follows the site theme: a dark canvas in dark mode, a white one in light mode. */
export const MAP_COLORS: Record<MapTheme, MapColors> = {
  dark: {
    background: '#060b16',
    text: '#e8eef9',
    muted: '#8d9bb5',
    accent: '#ffd27a',
    track: '#ffffff',
    trackAlpha: 0.22,
    outline: '#ffffff',
    outlineAlpha: 0.55,
    flow: '#ffffff',
    layers: { access: '#3fd0bd', mesh: '#6ea0ff', backbone: '#b18cff', cross: '#ff86b4', conjunction: '#ffbf55' },
  },
  light: {
    background: '#ffffff',
    text: '#111111',
    muted: '#4b5260',
    accent: '#c25e00',
    track: '#000000',
    trackAlpha: 0.28,
    outline: '#000000',
    outlineAlpha: 0.85,
    flow: '#111111',
    layers: { access: '#0c7f72', mesh: '#2457d6', backbone: '#6a3fd1', cross: '#b82a66', conjunction: '#94570a' },
  },
};

export interface LayerStyle {
  label: string;
  /** Dash and gap lengths in px; null is a solid line. */
  dash: [number, number] | null;
  width: number;
}

export const LAYER_STYLES: Record<string, LayerStyle> = {
  access: { label: 'Access', dash: [2, 5], width: 2 },
  mesh: { label: 'Regional mesh', dash: null, width: 1.5 },
  backbone: { label: 'Backbone', dash: null, width: 2.5 },
  cross: { label: 'Cross-link', dash: [10, 6], width: 2 },
  conjunction: { label: 'Conjunction reroute', dash: [3, 8], width: 2 },
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

const DEFAULT_BODY = '#c8cbd2';

type Hsl = [number, number, number];

function hexToHsl(color: string): Hsl {
  const n = parseInt(color.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToHex([h, s, l]: Hsl): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  const byte = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${byte(f(0))}${byte(f(8))}${byte(f(4))}`;
}

/**
 * A world's fill for the theme. On the dark canvas it is its natural colour. On the white canvas
 * its lightness is inverted (and kept in a mid-dark band) so it stands out from the background.
 */
export function bodyFill(id: string, theme: MapTheme): string {
  const natural = BODY_COLORS[id] ?? DEFAULT_BODY;
  if (theme === 'dark') return natural;
  if (id === 'sun') return '#b97600';
  const [h, s, l] = hexToHsl(natural);
  return hslToHex([h, Math.max(s, 0.3), Math.min(0.46, Math.max(0.22, 1 - l))]);
}

export const layerColor = (theme: MapTheme, layer: string): string =>
  MAP_COLORS[theme].layers[layer] ?? MAP_COLORS[theme].layers.mesh;
