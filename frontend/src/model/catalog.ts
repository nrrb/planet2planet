import raw from '../data/bodies.json';
import type { Body, Catalog } from './types';

export function validateCatalog(value: unknown): asserts value is Catalog {
  const fail = (message: string): never => { throw new Error(`Invalid catalog: ${message}`); };
  if (!value || typeof value !== 'object') fail('expected an object');
  const data = value as Catalog;
  const date = (s: unknown) => typeof s === 'string' && /Z$/.test(s) && Number.isFinite(Date.parse(s));
  if (!date(data.epoch) || !date(data.generatedAt)) fail('invalid UTC epoch/generation date');
  if (data.frame !== 'ICRF / J2000 ecliptic, parent-centered') fail('inconsistent reference frame');
  if (data.units?.distance !== 'km' || data.units?.period !== 'days' || data.units?.angle !== 'radians' || data.units?.time !== 'UTC') fail('inconsistent units');
  if (!['illustrative', 'horizons'].includes(data.referenceKind) || typeof data.provenance !== 'string' || !data.provenance.trim()) fail('missing provenance');
  if (!Array.isArray(data.bodies) || !data.bodies.length) fail('missing bodies');
  const ids = new Map<string, Body>();
  for (const body of data.bodies) {
    if (!body || typeof body.id !== 'string' || !body.id || ids.has(body.id)) fail('missing or duplicate ID');
    ids.set(body.id, body);
    if (typeof body.name !== 'string' || !body.name.trim() || !/^\d+$/.test(body.horizonsId)) fail(`${body.id}: invalid identity`);
    if (!Number.isFinite(body.radiusKm) || body.radiusKm <= 0) fail(`${body.id}: radius must be positive`);
    if (!/^#[\da-f]{6}$/i.test(body.color)) fail(`${body.id}: invalid color`);
    if (!Array.isArray(body.sources) || !body.sources.length || body.sources.some(s => typeof s !== 'string' || !URL.canParse(s) || new URL(s).protocol !== 'https:')) fail(`${body.id}: missing source`);
    if (body.parentId !== null) {
      const o = body.orbit;
      if (!o || !Number.isFinite(o.radiusKm) || o.radiusKm <= 0 || !Number.isFinite(o.periodDays) || o.periodDays <= 0 || !Number.isFinite(o.angleRad)) fail(`${body.id}: invalid orbit`);
      if (o!.direction !== 1 && o!.direction !== -1) fail(`${body.id}: invalid direction`);
      if (o!.epoch !== data.epoch) fail(`${body.id}: inconsistent epoch`);
    } else if (body.id !== 'sun' || body.orbit) fail('only the Sun may be a root');
  }
  if (!ids.has('sun')) fail('missing Sun');
  const visited = new Set<string>();
  const active = new Set<string>();
  function visit(body: Body) {
    if (active.has(body.id)) fail('cyclic parent');
    if (visited.has(body.id)) return;
    active.add(body.id);
    if (body.parentId !== null) {
      const parent = ids.get(body.parentId);
      if (!parent) fail(`${body.id}: absent parent`);
      visit(parent!);
    }
    active.delete(body.id);
    visited.add(body.id);
  }
  data.bodies.forEach(visit);
}

export function parentFirst(bodies: Body[]): Body[] {
  const byId = new Map(bodies.map(b => [b.id, b]));
  const ordered = new Set<Body>();
  function add(body: Body) {
    if (ordered.has(body)) return;
    if (body.parentId) add(byId.get(body.parentId)!);
    ordered.add(body);
  }
  bodies.forEach(add);
  return [...ordered];
}
validateCatalog(raw);
export const catalog: Catalog = { ...raw, bodies: parentFirst(raw.bodies as Body[]) };
export const bodies = catalog.bodies;
export const bodyById = new Map(bodies.map(body => [body.id, body]));
