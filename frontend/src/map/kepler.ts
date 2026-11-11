/**
 * Positions from the API's orbital elements. The same formulas as the backend ephemeris
 * (apps/network/ephemeris.py), so the map and the latency figures agree. The map animates
 * with these on its own clock; the backend is only the source of the elements.
 */
import type { components } from '../api/schema';

export type Orbit = components['schemas']['Orbit'];
export type Orbits = Readonly<Record<string, Orbit>>;
export interface Au {
  x: number;
  y: number;
}

export const AU_KM = 149_597_870.7;
export const J2000_MS = Date.UTC(2000, 0, 1, 12);
const DAY_MS = 86_400_000;

export const daysSinceJ2000 = (timeMs: number): number => (timeMs - J2000_MS) / DAY_MS;

/** Solve E - e sin E = M (radians) by Newton's method. */
export function solveKepler(meanAnomaly: number, e: number): number {
  const m = ((((meanAnomaly + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  let big = e < 0.8 ? m + e * Math.sin(m) : Math.PI;
  for (let i = 0; i < 50; i++) {
    const delta = (big - e * Math.sin(big) - m) / (1 - e * Math.cos(big));
    big -= delta;
    if (Math.abs(delta) < 1e-13) break;
  }
  return big;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

function need(value: number | null | undefined, name: string): number {
  if (value === undefined || value === null) throw new Error(`Orbit is missing ${name}`);
  return value;
}

/** Ecliptic-plane position in AU for a Sun-orbiting world, days after J2000. */
export function heliocentricPosition(orbit: Orbit, days: number): Au {
  const t = days / 36525;
  const a = need(orbit.semiMajorAxisAu, 'semiMajorAxisAu') + need(orbit.semiMajorAxisRate, 'rate') * t;
  const e = need(orbit.eccentricity, 'eccentricity') + need(orbit.eccentricityRate, 'rate') * t;
  const longPeri =
    need(orbit.longitudeOfPerihelionDeg, 'longitudeOfPerihelionDeg') +
    need(orbit.longitudeOfPerihelionRate, 'rate') * t;
  const meanLong = need(orbit.meanLongitudeDeg, 'meanLongitudeDeg') + need(orbit.meanLongitudeRate, 'rate') * t;
  let meanAnomaly = rad(meanLong - longPeri);
  if (orbit.b !== null && orbit.b !== undefined) {
    const f = rad(need(orbit.f, 'f') * t);
    meanAnomaly += rad(orbit.b * t * t);
    meanAnomaly += rad(need(orbit.c, 'c') * Math.cos(f) + need(orbit.s, 's') * Math.sin(f));
  }
  const big = solveKepler(meanAnomaly, e);
  const x = a * (Math.cos(big) - e);
  const y = a * Math.sqrt(1 - e * e) * Math.sin(big);
  const peri = rad(longPeri);
  return { x: x * Math.cos(peri) - y * Math.sin(peri), y: x * Math.sin(peri) + y * Math.cos(peri) };
}

/** A moon's offset from its parent on a circular orbit, in AU. */
export function moonOffset(orbit: Orbit, days: number): Au {
  const angle = rad(need(orbit.phaseDeg, 'phaseDeg')) + (2 * Math.PI * days) / need(orbit.periodDays, 'periodDays');
  const radius = need(orbit.orbitRadiusKm, 'orbitRadiusKm') / AU_KM;
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

/** True position in AU of any world, moons included. */
export function worldPositionAu(id: string, orbits: Orbits, days: number): Au {
  const orbit = orbits[id];
  if (!orbit) throw new Error(`No orbit for ${id}`);
  if (orbit.kind === 'moon') {
    if (!orbit.parent) throw new Error(`Moon ${id} has no parent`);
    const parent = worldPositionAu(orbit.parent, orbits, days);
    const offset = moonOffset(orbit, days);
    return { x: parent.x + offset.x, y: parent.y + offset.y };
  }
  return heliocentricPosition(orbit, days);
}
