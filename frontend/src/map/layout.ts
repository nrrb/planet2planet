/**
 * Display layout. Positions are true (Kepler) angles with a logarithmic radius, so the whole
 * system fits one viewport: Sun-orbiting worlds scale by distance from the Sun, moons by
 * distance from their parent. The scaling is display-only (ADR 0001).
 */
import { bodyRadius, SCALE } from '../model/scaling';
import type { Point } from '../model/types';
import {
  AU_KM,
  daysSinceJ2000,
  heliocentricPosition,
  moonOffset,
  type Orbit,
  type Orbits,
  solveKepler,
} from './kepler';

export const SUN_RADIUS_KM = 695_700;

export interface MapBody {
  id: string;
  name: string;
  parent: string | null;
  radiusKm: number;
  type: 'planet' | 'dwarf-planet' | 'moon';
}

/** Display radius for a world at `distanceKm` from the Sun. */
export const solarRadius = (distanceKm: number): number =>
  bodyRadius(SUN_RADIUS_KM) + SCALE.clearance + SCALE.solarScale * Math.log1p(distanceKm / SCALE.solarReferenceKm);

/** Display radius for a moon at `offsetKm` from a parent of `parentRadiusKm`. */
export const lunarRadius = (parentRadiusKm: number, offsetKm: number): number =>
  bodyRadius(parentRadiusKm) + SCALE.clearance + SCALE.lunarScale * Math.log1p(offsetKm / SCALE.lunarReferenceKm);

const polar = (radius: number, x: number, y: number): Point => {
  const angle = Math.atan2(y, x);
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
};

/** Display position of every body at `timeMs`. */
export function displayPositions(bodies: readonly MapBody[], orbits: Orbits, timeMs: number): Map<string, Point> {
  const days = daysSinceJ2000(timeMs);
  const byId = new Map(bodies.map((b) => [b.id, b]));
  const positions = new Map<string, Point>();
  const place = (body: MapBody): Point => {
    const known = positions.get(body.id);
    if (known) return known;
    const orbit = orbits[body.id];
    let point: Point;
    if (orbit.kind === 'moon') {
      const parentBody = byId.get(body.parent ?? '');
      if (!parentBody) throw new Error(`Moon ${body.id} has no parent body`);
      const parent = place(parentBody);
      const offset = moonOffset(orbit, days);
      const local = polar(lunarRadius(parentBody.radiusKm, Math.hypot(offset.x, offset.y) * AU_KM), offset.x, offset.y);
      point = { x: parent.x + local.x, y: parent.y + local.y };
    } else {
      const au = heliocentricPosition(orbit, days);
      point = polar(solarRadius(Math.hypot(au.x, au.y) * AU_KM), au.x, au.y);
    }
    positions.set(body.id, point);
    return point;
  };
  bodies.forEach(place);
  return positions;
}

/** A Sun-orbiting world's path as a closed polyline in display space. */
export function orbitTrack(orbit: Orbit, samples = 160): Point[] {
  const a = orbit.semiMajorAxisAu ?? 0;
  const e = orbit.eccentricity ?? 0;
  const peri = ((orbit.longitudeOfPerihelionDeg ?? 0) * Math.PI) / 180;
  const points: Point[] = [];
  for (let i = 0; i < samples; i++) {
    const big = solveKepler((i / samples) * 2 * Math.PI, e);
    const x = a * (Math.cos(big) - e);
    const y = a * Math.sqrt(1 - e * e) * Math.sin(big);
    const wx = x * Math.cos(peri) - y * Math.sin(peri);
    const wy = x * Math.sin(peri) + y * Math.cos(peri);
    points.push(polar(solarRadius(Math.hypot(wx, wy) * AU_KM), wx, wy));
  }
  return points;
}

/** A conjunction relay, drawn just outside the Sun at its azimuth (it really sits off the ecliptic). */
export function relayPosition([x, y]: readonly number[]): Point {
  return polar(bodyRadius(SUN_RADIUS_KM) + 8, x, y);
}

/** The radius that contains every Sun-orbiting world's track, for fitting the camera. */
export function systemRadius(bodies: readonly MapBody[], orbits: Orbits): number {
  let max = 0;
  for (const body of bodies) {
    const orbit = orbits[body.id];
    if (orbit.kind === 'moon') continue;
    for (const p of orbitTrack(orbit, 48)) max = Math.max(max, Math.hypot(p.x, p.y));
  }
  return max;
}
