import { describe, expect, it } from 'vitest';
import fixture from './kepler.fixture.json';
import type { Orbits } from './kepler';
import {
  displayPositions,
  lunarRadius,
  type MapBody,
  orbitTrack,
  relayPosition,
  solarRadius,
  systemRadius,
} from './layout';

const orbits = fixture.orbits as unknown as Orbits;
const body = (id: string, parent: string | null, radiusKm: number): MapBody => ({
  id,
  name: id,
  parent,
  radiusKm,
  type: parent ? 'moon' : 'planet',
});
const BODIES: MapBody[] = [
  body('io', 'jupiter', 1822),
  body('mercury', null, 2440),
  body('earth', null, 6371),
  body('jupiter', null, 69911),
  body('moon', 'earth', 1737),
  body('neptune', null, 24622),
];
const T = Date.UTC(2380, 5, 9, 12);

describe('display layout', () => {
  it('grows the display radius with distance, and compresses the outer system', () => {
    const au = 149_597_870.7;
    expect(solarRadius(0.4 * au)).toBeLessThan(solarRadius(1 * au));
    expect(solarRadius(1 * au)).toBeLessThan(solarRadius(30 * au));
    // A 25 AU gap in the outer system takes less room than a 4.6 AU gap in the inner system.
    expect(solarRadius(30 * au) - solarRadius(5 * au)).toBeLessThan(solarRadius(5 * au) - solarRadius(0.4 * au));
    expect(lunarRadius(69911, 421_700)).toBeGreaterThan(lunarRadius(69911, 100_000));
  });

  it('keeps the true angle: the display position points the same way as the real one', () => {
    const positions = displayPositions(BODIES, orbits, T);
    const earthCase = fixture.cases.find((c) => c.world === 'earth' && c.date === '2380-06-09');
    const p = positions.get('earth');
    expect(earthCase && p).toBeTruthy();
    if (!earthCase || !p) return;
    expect(Math.atan2(p.y, p.x)).toBeCloseTo(Math.atan2(earthCase.y, earthCase.x), 9);
  });

  it('places parents before moons regardless of input order', () => {
    const positions = displayPositions(BODIES, orbits, T);
    expect(positions.size).toBe(BODIES.length);
    const [io, jupiter] = [positions.get('io'), positions.get('jupiter')];
    expect(io && jupiter && Math.hypot(io.x - jupiter.x, io.y - jupiter.y)).toBeCloseTo(lunarRadius(69911, 421_700), 0);
  });

  it('moves bodies as time passes', () => {
    const a = displayPositions(BODIES, orbits, T).get('earth');
    const b = displayPositions(BODIES, orbits, T + 30 * 86_400_000).get('earth');
    expect(a && b && Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(10);
  });

  it('draws a closed track that matches the planet’s display distance range', () => {
    const track = orbitTrack(orbits.mars, 160);
    expect(track).toHaveLength(160);
    const radii = track.map((p) => Math.hypot(p.x, p.y));
    const now = displayPositions([body('mars', null, 3390)], orbits, T).get('mars');
    expect(now).toBeDefined();
    const r = now ? Math.hypot(now.x, now.y) : 0;
    expect(r).toBeGreaterThanOrEqual(Math.min(...radii) - 1);
    expect(r).toBeLessThanOrEqual(Math.max(...radii) + 1);
  });

  it('puts relays just outside the Sun at their azimuth', () => {
    const p = relayPosition([0, 0.5, -0.5]);
    expect(Math.atan2(p.y, p.x)).toBeCloseTo(Math.PI / 2, 9);
    expect(Math.hypot(p.x, p.y)).toBeLessThan(solarRadius(0.1 * 149_597_870.7));
  });

  it('reports a system radius that contains every planet', () => {
    const radius = systemRadius(BODIES, orbits);
    for (const p of displayPositions(BODIES, orbits, T).values()) {
      if (Math.hypot(p.x, p.y) > radius + 60) throw new Error('outside system radius');
    }
    expect(radius).toBeGreaterThan(0);
  });
});
