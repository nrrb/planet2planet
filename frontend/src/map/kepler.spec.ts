import { describe, expect, it } from 'vitest';
import fixture from './kepler.fixture.json';
import {
  AU_KM,
  daysSinceJ2000,
  heliocentricPosition,
  J2000_MS,
  moonOffset,
  solveKepler,
  worldPositionAu,
} from './kepler';
import type { Orbits } from './kepler';

// The fixture holds orbit data and positions exported from the backend ephemeris.
const orbits = fixture.orbits as unknown as Orbits;

describe('kepler', () => {
  it('counts days from J2000', () => {
    expect(daysSinceJ2000(J2000_MS)).toBe(0);
    expect(daysSinceJ2000(J2000_MS + 36525 * 86_400_000)).toBe(36525);
  });

  it('solves Kepler’s equation', () => {
    for (const e of [0, 0.2, 0.44, 0.9]) {
      for (const m of [-3, -1, 0, 0.5, 2.9, 7]) {
        const big = solveKepler(m, e);
        const wrapped = Math.atan2(Math.sin(m), Math.cos(m));
        expect(big - e * Math.sin(big)).toBeCloseTo(wrapped, 9);
      }
    }
  });

  it('puts Earth where it was on 1 January 2000', () => {
    const { x, y } = heliocentricPosition(orbits.earth, 0);
    expect(Math.hypot(x, y)).toBeCloseTo(0.9833, 2);
    expect(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360).toBeCloseTo(100.4, 0);
  });

  it('gives moons a constant offset radius from their parent', () => {
    const io = orbits.io;
    for (const day of [0, 1.2, 100.5]) {
      const offset = moonOffset(io, day);
      expect(Math.hypot(offset.x, offset.y) * AU_KM).toBeCloseTo(io.orbitRadiusKm ?? 0, 3);
    }
  });

  it.each(fixture.cases)('matches the backend for $world on $date', ({ date, world, x, y }) => {
    const days = daysSinceJ2000(Date.parse(`${date}T12:00:00Z`));
    const got = worldPositionAu(world, orbits, days);
    expect(got.x).toBeCloseTo(x, 8);
    expect(got.y).toBeCloseTo(y, 8);
  });

  it('refuses a world with no orbit', () => {
    expect(() => worldPositionAu('vulcan', orbits, 0)).toThrow('No orbit for vulcan');
  });
});
