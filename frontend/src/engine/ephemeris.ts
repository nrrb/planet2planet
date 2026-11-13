/**
 * Heliocentric positions from JPL approximate Keplerian elements, solved in 2D.
 *
 * Latency and conjunction only need distances at the site date, so inclination is ignored:
 * each body moves in the ecliptic plane with its true longitude measured from the longitude of
 * perihelion. The error for strongly inclined dwarf planets is a few percent of their distance,
 * which does not matter for latency.
 */

import { pyMod } from './util';

export const AU_KM = 149_597_870.7;
export const LIGHT_KM_S = 299_792.458;

/** Elements at J2000 and their rates per Julian century (JPL Tables 2a and 2b). */
export interface Elements {
  a: number;
  aRate: number;
  e: number;
  eRate: number;
  longPeri: number;
  longPeriRate: number;
  meanLong: number;
  meanLongRate: number;
  b: number | null;
  c: number | null;
  s: number | null;
  f: number | null;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Solves E - e sin E = M (radians) by Newton's method. */
export function solveKepler(meanAnomaly: number, e: number): number {
  const m = pyMod(meanAnomaly + Math.PI, 2 * Math.PI) - Math.PI;
  let bigE = e < 0.8 ? m + e * Math.sin(m) : Math.PI;
  for (let i = 0; i < 50; i += 1) {
    const delta = (bigE - e * Math.sin(bigE) - m) / (1 - e * Math.cos(bigE));
    bigE -= delta;
    if (Math.abs(delta) < 1e-13) break;
  }
  return bigE;
}

/** Position in AU in the ecliptic plane, `days` after J2000. */
export function heliocentricPosition(el: Elements, days: number): [number, number] {
  const t = days / 36525;
  const a = el.a + el.aRate * t;
  const e = el.e + el.eRate * t;
  const longPeri = el.longPeri + el.longPeriRate * t;
  const meanLong = el.meanLong + el.meanLongRate * t;
  let meanAnomaly = rad(meanLong - longPeri);
  if (el.b !== null) {
    const f = rad((el.f as number) * t);
    meanAnomaly += rad(el.b * t * t);
    meanAnomaly += rad((el.c as number) * Math.cos(f) + (el.s as number) * Math.sin(f));
  }
  const bigE = solveKepler(meanAnomaly, e);
  const x = a * (Math.cos(bigE) - e);
  const y = a * Math.sqrt(1 - e * e) * Math.sin(bigE);
  const peri = rad(longPeri);
  return [x * Math.cos(peri) - y * Math.sin(peri), x * Math.sin(peri) + y * Math.cos(peri)];
}

/** Circular orbit around the parent: a moon's offset in AU, `days` after J2000. */
export function moonOffsetAu(
  orbitRadiusKm: number,
  periodDays: number,
  phaseDeg: number,
  days: number,
): [number, number] {
  const angle = rad(phaseDeg) + (2 * Math.PI * days) / periodDays;
  const radius = orbitRadiusKm / AU_KM;
  return [radius * Math.cos(angle), radius * Math.sin(angle)];
}

/** One-way subspace delay over a straight line, in milliseconds. */
export function propagationMs(distanceAu: number, speedC = 52_000): number {
  return ((distanceAu * AU_KM) / (speedC * LIGHT_KM_S)) * 1000;
}
