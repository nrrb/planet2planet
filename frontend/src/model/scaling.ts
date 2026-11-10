import type { Body } from './types';
export const SCALE = {
  minRadiusPx: 2, bodyReferenceKm: 100, bodyScale: 3,
  solarReferenceKm: 40_000_000, solarScale: 180,
  lunarReferenceKm: 100_000, lunarScale: 24, clearance: 12,
  minZoom: 0.12, maxZoom: 14, focusPadding: 1.3,
  growSeconds: 0.7, pulseSeconds: 1.8, defaultSpeed: 86_400,
};
export const bodyRadius = (radiusKm: number) => Math.max(SCALE.minRadiusPx, SCALE.bodyScale * Math.log1p(radiusKm / SCALE.bodyReferenceKm));
export function orbitRadius(body: Body, parent: Body): number {
  if (!body.orbit) return 0;
  const solar = parent.id === 'sun';
  return bodyRadius(parent.radiusKm) + SCALE.clearance +
    (solar ? SCALE.solarScale : SCALE.lunarScale) * Math.log1p(body.orbit.radiusKm / (solar ? SCALE.solarReferenceKm : SCALE.lunarReferenceKm));
}
