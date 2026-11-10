import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bodies, bodyById, catalog, parentFirst, validateCatalog } from '../src/model/catalog';
import { angleAt, DAY_MS, positionsAt } from '../src/model/orbits';
import { bodyRadius, orbitRadius, SCALE } from '../src/model/scaling';
import { EMPTY, select } from '../src/model/selection';
import { SimulationClock } from '../src/model/clock';
import { Camera } from '../src/model/camera';
import type { Catalog } from '../src/model/types';
const close = (actual: number, expected: number, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);

test('complete parent-first catalog; validation accepts non-ordered data', () => {
  assert.equal(bodies.length, 30);
  assert.equal(bodies.filter(b => b.parentId === 'sun').length, 8);
  assert.equal(bodies.filter(b => b.parentId && b.parentId !== 'sun').length, 21);
  const reversed = structuredClone(catalog);
  reversed.bodies.reverse(); validateCatalog(reversed);
  const order = parentFirst(reversed.bodies);
  order.forEach((b, i) => { if (b.parentId) assert.ok(order.findIndex(p => p.id === b.parentId) < i); });
});

test('catalog rejects invalid identities, parents, orbits, epochs, units and provenance', () => {
  const mutations: ((data: Catalog) => void)[] = [
    d => { d.bodies[1].id = 'sun'; },
    d => { d.bodies[1].parentId = 'missing'; },
    d => { d.bodies[1].parentId = 'venus'; d.bodies[2].parentId = 'mercury'; },
    d => { d.bodies[1].radiusKm = 0; },
    d => { d.bodies[1].orbit!.periodDays = -1; },
    d => { d.bodies[1].orbit!.radiusKm = NaN; },
    d => { d.bodies[1].orbit!.angleRad = Infinity; },
    d => { d.bodies[1].orbit!.direction = 0 as 1; },
    d => { d.bodies[1].orbit!.epoch = '2000-01-01T00:00:00Z'; },
    d => { d.units.distance = 'm'; },
    d => { d.frame = 'equatorial'; },
    d => { d.provenance = ''; },
    d => { d.bodies[1].sources = []; },
    d => { d.epoch = 'invalid'; },
    d => { d.bodies[1].horizonsId = 'Earth barycenter'; },
  ];
  for (const mutate of mutations) { const data = structuredClone(catalog); mutate(data); assert.throws(() => validateCatalog(data), /Invalid catalog/); }
});

test('absolute orbits are periodic and deterministic, and Triton is retrograde', () => {
  const epoch = Date.parse(catalog.epoch);
  for (const body of bodies.filter(b => b.orbit)) {
    const end = angleAt(body, epoch + body.orbit!.periodDays * DAY_MS);
    close(Math.sin(end), Math.sin(body.orbit!.angleRad));
    close(Math.cos(end), Math.cos(body.orbit!.angleRad));
  }
  const triton = bodyById.get('triton')!;
  assert.ok(angleAt(triton, epoch + DAY_MS / 100) < angleAt(triton, epoch));
  const first = positionsAt(bodies, epoch + DAY_MS);
  positionsAt(bodies, epoch + 100 * DAY_MS);
  assert.deepEqual(positionsAt(bodies, epoch + DAY_MS), first);
  assert.deepEqual(first.get('sun'), { x: 0, y: 0 });
});

test('parent translation carries moon positions without rotating local axes', () => {
  const epoch = Date.parse(catalog.epoch);
  const before = positionsAt(bodies, epoch);
  const changed = structuredClone(bodies);
  changed.find(b => b.id === 'earth')!.orbit!.angleRad += 1;
  const after = positionsAt(changed, epoch);
  const earth = before.get('earth')!, moon = before.get('moon')!;
  const earthAfter = after.get('earth')!, moonAfter = after.get('moon')!;
  close(moon.x - earth.x, moonAfter.x - earthAfter.x);
  close(moon.y - earth.y, moonAfter.y - earthAfter.y);
});

test('shared size and level-specific orbit mappings are finite, monotonic, and clear parent disks', () => {
  let previous = 0;
  for (const radius of [1, 10, 100, 1000, 10000, 100000, 1000000]) {
    const current = bodyRadius(radius); assert.ok(Number.isFinite(current) && current >= previous); previous = current;
  }
  for (const parent of bodies) {
    const children = bodies.filter(b => b.parentId === parent.id).sort((a, b) => a.orbit!.radiusKm - b.orbit!.radiusKm);
    let last = bodyRadius(parent.radiusKm);
    for (const child of children) { const r = orbitRadius(child, parent); assert.ok(Number.isFinite(r) && r > last); last = r; }
  }
});

test('canvas selection handles self rejection, pair, restart and clear; HTML shares state', () => {
  let state = select(EMPTY, { type: 'click', id: 'earth' });
  assert.deepEqual(state, { origin: 'earth', destination: null });
  assert.deepEqual(select(state, { type: 'click', id: 'earth' }), state);
  assert.deepEqual(select(state, { type: 'destination', id: 'earth' }), state);
  state = select(state, { type: 'click', id: 'triton' });
  assert.deepEqual(state, select(select(EMPTY, { type: 'origin', id: 'earth' }), { type: 'destination', id: 'triton' }));
  assert.deepEqual(select(state, { type: 'click', id: 'io' }), { origin: 'io', destination: null });
  assert.deepEqual(select(state, { type: 'origin', id: 'moon' }), { origin: 'moon', destination: null });
  assert.deepEqual(select(state, { type: 'clear' }), EMPTY);
  assert.deepEqual(select(EMPTY, { type: 'destination', id: 'io' }), EMPTY);
});

test('shared monotonic clock: speed, pause, hidden-tab suspension, and Now preservation', () => {
  const clock = new SimulationClock(1000, 86400, true);
  clock.tick(10); close(clock.tick(1010), 86401000);
  clock.playing = false; clock.tick(2010); close(clock.time, 86401000);
  clock.playing = true; clock.speed = 1; clock.tick(3010); close(clock.time, 86402000);
  clock.tick(4010, true); clock.tick(1_000_000); close(clock.time, 86402000);
  clock.tick(1_001_000); close(clock.time, 86403000);
  clock.time = 2000; clock.rebase(); clock.tick(1_002_000);
  assert.equal(clock.speed, 1); assert.equal(clock.playing, true); assert.equal(clock.time, 2000);
});

test('camera screen/world inverses, pointer zoom, follow, pan cancellation, reset, bounds', () => {
  const camera = new Camera(); camera.width = 900; camera.height = 600;
  camera.reset(1000); const initialZoom = camera.zoom;
  assert.deepEqual(camera.screen({ x: 0, y: 0 }), { x: 450, y: 300 });
  const point = { x: 600, y: 200 }, before = camera.world(point);
  camera.zoomAt(2, point);
  close(camera.world(point).x, before.x); close(camera.world(point).y, before.y);
  camera.following = 'moon'; camera.follow(new Map([['moon', { x: 5, y: 10 }]]));
  camera.zoomAt(1.2, point);
  assert.equal(camera.following, 'moon'); assert.deepEqual(camera.screen({ x: 5, y: 10 }), { x: 450, y: 300 });
  camera.pan(10, 20); assert.equal(camera.following, null);
  camera.reset(1000); assert.equal(camera.x, 0); assert.equal(camera.y, 0); close(camera.zoom, initialZoom);
  camera.zoomAt(1e10, point); assert.equal(camera.zoom, SCALE.maxZoom);
  camera.zoomAt(1e-20, point); assert.equal(camera.zoom, SCALE.minZoom);
});
