import { describe, expect, it } from 'vitest';
import { bodyFill, LAYER_ORDER, layerColor, MAP_COLORS, type MapTheme } from './palette';

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const BODIES = [
  'sun',
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'ceres',
  'pluto',
  'haumea',
  'makemake',
  'eris',
  'moon',
  'io',
  'europa',
  'ganymede',
  'callisto',
  'mimas',
  'enceladus',
  'tethys',
  'dione',
  'rhea',
  'titan',
  'iapetus',
  'miranda',
  'ariel',
  'umbriel',
  'titania',
  'oberon',
  'triton',
  'charon',
  'dysnomia',
];

describe.each<MapTheme>(['dark', 'light'])('%s map colours', (theme) => {
  const { background, text, accent } = MAP_COLORS[theme];

  it('draws every world so it stands out from the background', () => {
    for (const id of BODIES) expect(contrast(bodyFill(id, theme), background), id).toBeGreaterThanOrEqual(3);
  });

  it('draws every link layer, the labels and the highlight legibly', () => {
    for (const layer of LAYER_ORDER)
      expect(contrast(layerColor(theme, layer), background), layer).toBeGreaterThanOrEqual(3);
    expect(contrast(text, background)).toBeGreaterThanOrEqual(7);
    expect(contrast(accent, background)).toBeGreaterThanOrEqual(3);
  });
});

describe('light mode inverts luminance', () => {
  it('uses a white canvas with black text, orbit paths and outlines', () => {
    const light = MAP_COLORS.light;
    expect(light.background).toBe('#ffffff');
    expect(light.text).toBe('#111111');
    expect(light.track).toBe('#000000');
    expect(light.outline).toBe('#000000');
  });

  it('makes pale worlds dark and keeps their hue', () => {
    expect(luminance(bodyFill('moon', 'light'))).toBeLessThan(luminance(bodyFill('moon', 'dark')));
    expect(luminance(bodyFill('saturn', 'light'))).toBeLessThan(0.3);
    // Earth stays blue: its blue channel still leads.
    const n = parseInt(bodyFill('earth', 'light').slice(1), 16);
    expect(n & 255).toBeGreaterThan((n >> 16) & 255);
  });

  it('leaves worlds at their natural colour on the dark canvas', () => {
    expect(bodyFill('earth', 'dark')).toBe('#4d9fff');
  });

  it('falls back to a neutral colour for an unknown world', () => {
    expect(bodyFill('vulcan', 'dark')).toBe('#c8cbd2');
    expect(bodyFill('vulcan', 'light')).toMatch(/^#[0-9a-f]{6}$/);
  });
});
