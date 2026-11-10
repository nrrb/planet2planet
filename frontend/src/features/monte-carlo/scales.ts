/** Scales and layout for the charts. Plain functions, so they can be tested without a browser. */

type Domain = readonly [number, number];

export function linearScale(domain: Domain, range: Domain): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (value) => r0 + ((value - d0) / span) * (r1 - r0);
}

/** A logarithmic scale; values at or below zero land on the start of the range. */
export function logScale(domain: Domain, range: Domain): (value: number) => number {
  const [l0, l1] = [Math.log10(domain[0]), Math.log10(domain[1])];
  const linear = linearScale([l0, l1], range);
  return (value) => (value <= 0 ? range[0] : linear(Math.log10(value)));
}

/** Round tick values (1, 2, 2.5 or 5 times a power of ten) that fall within [min, max]. */
export function niceTicks(min: number, max: number, count: number): number[] {
  const rough = (max - min) / Math.max(count, 1) || 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10;
  const first = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let t = first; t <= max + step * 0.01; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  return ticks.filter((t) => t >= min - step * 0.01 && t <= max + step * 0.01);
}

export function logTicks(min: number, max: number): number[] {
  const ticks: number[] = [];
  for (let e = Math.ceil(Math.log10(min)); 10 ** e <= max; e++) ticks.push(10 ** e);
  return ticks;
}

/** A year axis padded out to whole decades. */
export function yearDomain(years: readonly number[]): [number, number] {
  if (!years.length) return [2150, 2380];
  return [Math.floor(Math.min(...years) / 10) * 10, Math.ceil(Math.max(...years) / 10) * 10];
}

export interface Dot {
  x: number;
  /** 0 is the bottom of the stack. */
  row: number;
  value: number;
}

/**
 * One dot per run, stacked upwards where several runs share a value. There is no jitter, so the
 * plot is the same every time and every run stays visible.
 */
export function stackDots(samples: readonly number[], x: (value: number) => number): Dot[] {
  const rows = new Map<number, number>();
  return [...samples]
    .sort((a, b) => a - b)
    .map((value) => {
      const row = rows.get(value) ?? 0;
      rows.set(value, row + 1);
      return { x: x(value), row, value };
    });
}
