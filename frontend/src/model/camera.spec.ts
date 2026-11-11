import { describe, expect, it } from 'vitest';
import { Camera } from './camera';
import { bodyRadius, SCALE } from './scaling';

describe('Camera', () => {
  const setup = () => {
    const camera = new Camera();
    camera.width = 900;
    camera.height = 600;
    camera.reset(1000);
    return camera;
  };

  it('converts between screen and world and back', () => {
    const camera = setup();
    expect(camera.screen({ x: 0, y: 0 })).toEqual({ x: 450, y: 300 });
    const point = { x: 600, y: 200 };
    const world = camera.world(point);
    const back = camera.screen(world);
    expect(back.x).toBeCloseTo(point.x);
    expect(back.y).toBeCloseTo(point.y);
  });

  it('zooms about the pointer, keeping the world point under it fixed', () => {
    const camera = setup();
    const point = { x: 600, y: 200 };
    const before = camera.world(point);
    camera.zoomAt(2, point);
    expect(camera.world(point).x).toBeCloseTo(before.x);
    expect(camera.world(point).y).toBeCloseTo(before.y);
  });

  it('follows a body, and stops following when panned', () => {
    const camera = setup();
    camera.following = 'moon';
    camera.follow(new Map([['moon', { x: 5, y: 10 }]]));
    camera.zoomAt(1.2, { x: 600, y: 200 });
    expect(camera.following).toBe('moon');
    expect(camera.screen({ x: 5, y: 10 })).toEqual({ x: 450, y: 300 });
    camera.pan(10, 20);
    expect(camera.following).toBeNull();
  });

  it('resets to the centre at the starting zoom', () => {
    const camera = setup();
    const initial = camera.zoom;
    camera.zoomAt(3, { x: 100, y: 100 });
    camera.pan(50, 50);
    camera.reset(1000);
    expect([camera.x, camera.y]).toEqual([0, 0]);
    expect(camera.zoom).toBeCloseTo(initial);
  });

  it('keeps the zoom within its bounds', () => {
    const camera = setup();
    camera.zoomAt(1e10, { x: 1, y: 1 });
    expect(camera.zoom).toBe(SCALE.maxZoom);
    camera.zoomAt(1e-20, { x: 1, y: 1 });
    expect(camera.zoom).toBe(SCALE.minZoom);
  });
});

describe('bodyRadius', () => {
  it('is finite and never shrinks as bodies get bigger', () => {
    let previous = 0;
    for (const km of [1, 10, 100, 1000, 10_000, 100_000, 1_000_000]) {
      const r = bodyRadius(km);
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(previous);
      previous = r;
    }
  });

  it('never goes below the minimum on-screen size', () => {
    expect(bodyRadius(0.001)).toBeGreaterThanOrEqual(SCALE.minRadiusPx);
  });
});
