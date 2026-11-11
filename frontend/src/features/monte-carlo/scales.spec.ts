import { describe, expect, it } from 'vitest';
import { linearScale, logScale, logTicks, niceTicks, stackDots, yearDomain } from './scales';

describe('linearScale', () => {
  it('maps the domain onto the range, in either direction', () => {
    const x = linearScale([2150, 2250], [0, 500]);
    expect(x(2150)).toBe(0);
    expect(x(2200)).toBe(250);
    expect(x(2250)).toBe(500);
    expect(linearScale([0, 10], [100, 0])(2.5)).toBe(75);
  });

  it('does not divide by zero for a flat domain', () => {
    const x = linearScale([2190, 2190], [0, 100]);
    expect(Number.isFinite(x(2190))).toBe(true);
  });
});

describe('logScale', () => {
  it('puts each power of ten the same distance apart', () => {
    const x = logScale([1e3, 1e9], [0, 600]);
    expect(x(1e3)).toBeCloseTo(0);
    expect(x(1e6)).toBeCloseTo(300);
    expect(x(1e9)).toBeCloseTo(600);
  });

  it('clamps values at or below zero to the left edge instead of failing', () => {
    const x = logScale([1e3, 1e9], [0, 600]);
    expect(x(0)).toBe(0);
    expect(x(-5)).toBe(0);
  });
});

describe('ticks', () => {
  it('chooses round, evenly spaced steps that stay inside the range', () => {
    expect(niceTicks(2152, 2297, 6)).toEqual([2175, 2200, 2225, 2250, 2275]);
    const ticks = niceTicks(0, 97, 5);
    expect(ticks).toEqual([0, 20, 40, 60, 80]);
    expect(ticks.every((t) => t >= 0 && t <= 97)).toBe(true);
  });

  it('gives one tick per power of ten on a log axis', () => {
    expect(logTicks(1e3, 2e8)).toEqual([1e3, 1e4, 1e5, 1e6, 1e7, 1e8]);
  });
});

describe('yearDomain', () => {
  it('pads to whole decades', () => {
    expect(yearDomain([2171, 2190, 2205])).toEqual([2170, 2210]);
  });
  it('copes with an empty list', () => {
    expect(yearDomain([])).toEqual([2150, 2380]);
  });
});

describe('stackDots', () => {
  const x = linearScale([2170, 2210], [0, 400]);

  it('stacks runs with the same value, so every run stays visible and nothing is random', () => {
    const dots = stackDots([2190, 2190, 2190, 2195], x);
    const at2190 = dots.filter((d) => d.value === 2190);
    expect(at2190).toHaveLength(3);
    expect(new Set(at2190.map((d) => d.x)).size).toBe(1);
    expect(new Set(at2190.map((d) => d.row)).size).toBe(3);
    expect(dots.find((d) => d.value === 2195)?.row).toBe(0);
    expect(stackDots([2190, 2190, 2195], x)).toEqual(stackDots([2190, 2190, 2195], x));
  });

  it('keeps one dot per run', () => {
    const samples = Array.from({ length: 400 }, (_, i) => 2175 + (i % 31));
    expect(stackDots(samples, x)).toHaveLength(400);
  });
});
