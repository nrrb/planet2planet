import type { Body, Point } from './types';
import { orbitRadius } from './scaling';
export const DAY_MS = 86_400_000;
export function angleAt(body: Body, timestamp: number): number {
  const o = body.orbit;
  if (!o) return 0;
  const turns = ((timestamp - Date.parse(o.epoch)) / DAY_MS / o.periodDays) % 1;
  return o.angleRad + o.direction * 2 * Math.PI * turns;
}
// Call with validated, parent-first data. Local axes never rotate with the parent.
export function positionsAt(bodies: Body[], timestamp: number): Map<string, Point> {
  const byId = new Map(bodies.map((b) => [b.id, b]));
  const positions = new Map<string, Point>();
  for (const body of bodies) {
    const parent = body.parentId ? byId.get(body.parentId)! : null;
    const center = parent ? positions.get(parent.id)! : { x: 0, y: 0 };
    const r = parent ? orbitRadius(body, parent) : 0;
    const angle = angleAt(body, timestamp);
    positions.set(body.id, { x: center.x + r * Math.cos(angle), y: center.y + r * Math.sin(angle) });
  }
  return positions;
}
