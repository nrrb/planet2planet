import type { Company, HistoryEvent } from '../../api/types';

export const YEAR_MIN = 1962;
export const YEAR_MAX = 2380;

export interface WorldState {
  constellation: 'none' | 'conventional' | 'subspace';
  colonized: boolean;
}

/**
 * What each world has at the end of `year`: no constellation, a conventional (light-speed) one,
 * or a subspace one, and whether its colony has been founded. A conventional constellation turns
 * into a subspace one in the year it is converted.
 */
export function worldStatesAt(events: readonly HistoryEvent[], year: number): Map<string, WorldState> {
  const conventional = new Map<string, number>();
  const converted = new Map<string, number>();
  const subspace = new Map<string, number>();
  const colonized = new Map<string, number>();
  for (const e of events) {
    if (e.type === 'conventional-constellation') conventional.set(e.world, e.year);
    else if (e.type === 'constellation-converted') converted.set(e.world, e.year);
    else if (e.type === 'subspace-constellation') subspace.set(e.world, e.year);
    else if (e.type === 'colonized') colonized.set(e.world, e.year);
  }
  const worlds = new Set([...conventional.keys(), ...converted.keys(), ...subspace.keys(), ...colonized.keys()]);
  const out = new Map<string, WorldState>();
  for (const world of worlds) {
    const since = subspace.get(world);
    const first = conventional.get(world);
    const turned = converted.get(world);
    let constellation: WorldState['constellation'] = 'none';
    if (since !== undefined && since <= year) constellation = 'subspace';
    else if (first !== undefined && first <= year)
      constellation = turned !== undefined && turned <= year ? 'subspace' : 'conventional';
    out.set(world, { constellation, colonized: (colonized.get(world) ?? Infinity) <= year });
  }
  return out;
}

export interface Counts {
  colonized: number;
  subspace: number;
  conventional: number;
  million: number;
  brands: number;
}

/** The live figures for a year. A brand stops trading when a company is merged into its buyer. */
export function countsAt(events: readonly HistoryEvent[], companies: readonly Company[], year: number): Counts {
  const states = [...worldStatesAt(events, year).values()];
  const million = new Set(
    events.filter((e) => e.type === 'population-one-million' && e.year <= year).map((e) => e.world),
  );
  const brands = companies.filter(
    (c) => c.founded <= year && !(c.status === 'merged' && (c.acquiredYear ?? Infinity) <= year),
  ).length;
  return {
    colonized: states.filter((s) => s.colonized).length,
    subspace: states.filter((s) => s.constellation === 'subspace').length,
    conventional: states.filter((s) => s.constellation === 'conventional').length,
    million: million.size,
    brands,
  };
}

/** The most recent events up to `year`, newest first. */
export function latestEvents(events: readonly HistoryEvent[], year: number, count: number): HistoryEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.year <= year)
    .sort((a, b) => b.event.year - a.event.year || b.index - a.index)
    .slice(0, count)
    .map(({ event }) => event);
}
