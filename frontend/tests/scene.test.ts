import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Application, Graphics } from 'pixi.js';
import { SolarSystemScene, type SceneSettings } from '../src/rendering/SolarSystemScene';
import { SimulationClock } from '../src/model/clock';
import { EMPTY, select } from '../src/model/selection';
import { bodies, catalog } from '../src/model/catalog';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MapControls } from '../src/components/MapControls';

// Exercise the real scene/Graphics with a tiny host adapter; no GPU is needed here.
test('scene startup, canvas/HTML agreement, gestures, and mount/unmount cleanup', async t => {
  class Canvas extends EventTarget {
    style = { cursor: '' };
    captures = new Set<number>();
    setAttribute() {}
    setPointerCapture(id: number) { this.captures.add(id); }
    hasPointerCapture(id: number) { return this.captures.has(id); }
    releasePointerCapture(id: number) { this.captures.delete(id); }
    getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 700 }; }
  }
  const originalInit = Application.prototype.init;
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalObserver = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
  const document = Object.assign(new EventTarget(), { hidden: false });
  let activeObservers = 0;
  let liveLoops = 0;
  let destroyed = 0;
  let canvasCount = 0;
  let frame: (() => void) | null = null;
  let canvas: Canvas;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1 } });
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: class {
    observe() { activeObservers++; }
    disconnect() { activeObservers--; }
  } });
  Application.prototype.init = async function () {
    canvas = new Canvas();
    Object.defineProperty(this, 'canvas', { value: canvas });
    Object.defineProperty(this, 'renderer', { value: { resize() {} } });
    Object.defineProperty(this, 'ticker', { value: {
      add(callback: () => void) { frame = callback; liveLoops++; },
      remove(callback: () => void) { assert.equal(callback, frame); frame = null; liveLoops--; },
    } });
    this.start = () => {};
    this.destroy = () => { this.stage.destroy({ children: true }); destroyed++; if (canvasCount) canvasCount--; };
  };
  try {
    const clock = new SimulationClock(Date.parse(catalog.epoch), 86400, false);
    let selection = EMPTY;
    const settings: SceneSettings = { selection, tracks: true, focusPreview: null, effects: false };
    let following: string | null = null;
    const callbacks = { read: () => ({ ...settings, selection }), select: (id: string) => { selection = select(selection, { type: 'click', id }); }, time() {}, view: (id: string | null) => { following = id; } };
    const host = { appendChild() { canvasCount++; }, getBoundingClientRect: () => ({ width: 1000, height: 700 }) } as unknown as HTMLElement;
    const cancelled = await SolarSystemScene.create(clock, callbacks);
    cancelled.destroy(); // Async creation resolved after effect cleanup.
    assert.equal(liveLoops, 0); assert.equal(canvasCount, 0);
    const scene = await SolarSystemScene.create(clock, callbacks);
    scene.mount(host); frame!();
    assert.equal(canvasCount, 1); assert.equal(liveLoops, 1); assert.equal(activeObservers, 1);
    const internal = scene as unknown as { disks: Map<string, { visible: boolean }>; positions: Map<string, { x: number; y: number }>; tracks: Map<string, unknown>; labels: Map<string, { visible: boolean }> };
    assert.equal(internal.disks.size, 30); assert.equal(internal.labels.size, 30); assert.equal(internal.tracks.size, 29);
    for (const body of bodies) assert.equal(internal.labels.get(body.id)!.visible, internal.disks.get(body.id)!.visible);
    assert.deepEqual(scene.camera.screen(internal.positions.get('sun')!), { x: 500, y: 350 });
    const pointer = (type: string, x: number, y: number) => {
      const event = new Event(type);
      Object.assign(event, { pointerId: 1, button: 0, clientX: x, clientY: y });
      canvas.dispatchEvent(event);
    };
    pointer('pointerdown', 500, 350); pointer('pointerup', 500, 350);
    assert.equal(selection.origin, 'sun');
    pointer('pointerdown', 500, 350); pointer('pointerup', 500, 350);
    assert.equal(selection.destination, null);
    selection = select(selection, { type: 'destination', id: 'triton' }); frame!();
    assert.ok(internal.disks.get('triton')!.visible); // Selected tiny moon survives overview hiding.
    const props = { playing: false, speed: 86400, time: clock.time, tracks: true, selection, focusId: 'earth', togglePlay() {}, setSpeed() {}, now() {}, setTracks() {}, setFocus() {}, focus() {}, select() {}, preview() {} };
    const html = renderToStaticMarkup(createElement(MapControls, props));
    assert.ok(html.includes('Sun ↔ Triton'));
    assert.ok(html.includes('value="sun" selected=""'));
    assert.ok(html.includes('value="triton" selected=""'));
    for (const body of bodies) assert.ok(html.includes(`value="${body.id}"`));
    const connection = scene as unknown as { connectionLayer: Graphics; drawConnection(settings: SceneSettings, elapsed: number): void };
    const pulses = t.mock.method(connection.connectionLayer, 'circle');
    settings.effects = true; clock.playing = true;
    connection.drawConnection({ ...settings, selection }, 0);
    const start = pulses.mock.calls.map(call => call.arguments);
    assert.equal(start.length, 6);
    pulses.mock.resetCalls();
    connection.drawConnection({ ...settings, selection }, 0.1);
    const moving = pulses.mock.calls.map(call => call.arguments);
    assert.equal(moving.length, 6);
    const a = scene.camera.screen(internal.positions.get('sun')!);
    const b = scene.camera.screen(internal.positions.get('triton')!);
    const alongEdge = (i: number) => (moving[i][0] - start[i][0]) * (b.x - a.x) + (moving[i][1] - start[i][1]) * (b.y - a.y);
    assert.ok(alongEdge(0) > 0); assert.ok(alongEdge(1) < 0);
    pulses.mock.resetCalls(); clock.playing = false;
    connection.drawConnection({ ...settings, selection }, 0.1);
    assert.deepEqual(pulses.mock.calls.map(call => call.arguments), moving);
    pulses.mock.resetCalls(); settings.effects = false;
    connection.drawConnection({ ...settings, selection }, 0.1);
    assert.equal(pulses.mock.callCount(), 0);
    pulses.mock.restore();
    scene.focus('saturn'); frame!(); assert.equal(following, 'saturn');
    for (const body of bodies.filter(b => b.parentId === 'saturn')) {
      assert.ok(internal.disks.get(body.id)!.visible);
      assert.ok(internal.labels.get(body.id)!.visible);
    }
    const zoom = scene.camera.zoom; scene.zoom(1.2); assert.equal(following, 'saturn'); assert.ok(scene.camera.zoom > zoom);
    pointer('pointerdown', 10, 10); pointer('pointermove', 50, 40); pointer('pointerup', 50, 40);
    assert.equal(following, null); assert.deepEqual(selection, { origin: 'sun', destination: 'triton' });
    const before = new Map(internal.positions); clock.time += 86400000; frame!();
    assert.notDeepEqual(internal.positions.get('triton'), before.get('triton'));
    scene.reset(); assert.equal(following, null); assert.equal(scene.camera.x, 0);
    scene.destroy(); assert.equal(liveLoops, 0); assert.equal(activeObservers, 0); assert.equal(canvasCount, 0);
    const remounted = await SolarSystemScene.create(clock, callbacks); remounted.mount(host); frame!();
    assert.equal(liveLoops, 1); assert.equal(canvasCount, 1);
    remounted.destroy(); assert.equal(liveLoops, 0); assert.equal(activeObservers, 0); assert.equal(canvasCount, 0); assert.equal(destroyed, 3);
  } finally {
    Application.prototype.init = originalInit;
    for (const [key, descriptor] of [['document', originalDocument], ['window', originalWindow], ['ResizeObserver', originalObserver]] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
