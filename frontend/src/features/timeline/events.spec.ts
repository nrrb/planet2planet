import { describe, expect, it } from 'vitest';
import type { Company, HistoryEvent, World } from '../../api/types';
import {
  buildTimeline,
  CANON_MARKERS,
  describeEvent,
  eraOf,
  ERAS,
  FILTER_GROUPS,
  type GroupId,
  milestoneKeys,
} from './events';

const world = (id: string, region: string, name = id): World => ({
  id,
  name,
  region,
  type: 'planet',
  parent: null,
  eligible: true,
  radiusKm: 1,
});
const company = (id: string, kind: string, name = id): Company => ({ id, name, kind }) as unknown as Company;
const ev = (year: number, type: string, worldId: string, extra: Record<string, unknown> = {}): HistoryEvent => ({
  year,
  type,
  world: worldId,
  company: null,
  buyer: null,
  detail: null,
  ...extra,
});

const WORLDS = [
  world('earth', 'earth-luna', 'Earth'),
  world('moon', 'earth-luna', 'Moon'),
  world('mars', 'mars', 'Mars'),
  world('jupiter', 'jovian', 'Jupiter'),
  world('io', 'jovian', 'Io'),
];
const COMPANIES = [
  company('terran', 'backbone', 'Terran Transit'),
  company('cassini', 'regional', 'Cassini Link'),
  company('gw', 'gateway', 'Some Gateway'),
];
const ALL: ReadonlySet<GroupId> = new Set(Object.keys(FILTER_GROUPS) as GroupId[]);

const EVENTS: HistoryEvent[] = [
  ev(1962, 'conventional-constellation', 'earth'),
  ev(1962, 'company-founded', 'earth', { company: 'terran' }),
  ev(2067, 'conventional-constellation', 'moon'),
  ev(2069, 'colonized', 'moon'),
  ev(2069, 'conventional-constellation', 'mars'),
  ev(2103, 'colonized', 'mars'),
  ev(2149, 'conventional-constellation', 'jupiter'),
  ev(2151, 'constellation-converted', 'earth'),
  ev(2156, 'subspace-constellation', 'io'),
  ev(2209, 'company-founded', 'earth', { company: 'cassini' }),
  ev(2250, 'company-founded', 'earth', { company: 'gw' }),
  ev(2290, 'colonized', 'io'),
  ev(2300, 'population-one-million', 'mars'),
  ev(2301, 'company-acquired', 'earth', { company: 'cassini', buyer: 'terran' }),
];

describe('eras', () => {
  it('cover every year with no gaps, in order', () => {
    expect(ERAS.map((e) => e.id)).toEqual(['pre-subspace', 'early-subspace', 'expansion', 'mature-market']);
    for (const year of [1962, 2150, 2151, 2199, 2200, 2299, 2300, 2380]) expect(eraOf(year)).toBeDefined();
    expect(eraOf(2150).id).toBe('pre-subspace');
    expect(eraOf(2151).id).toBe('early-subspace');
    expect(eraOf(2200).id).toBe('expansion');
    expect(eraOf(2300).id).toBe('mature-market');
  });
});

describe('milestoneKeys', () => {
  const keys = milestoneKeys(EVENTS, WORLDS, COMPANIES);
  const marked = (e: HistoryEvent) => keys.has(`${EVENTS.indexOf(e)}`);

  it('marks the first relay constellation, each new region reached, and the conversions', () => {
    expect(marked(EVENTS[0])).toBe(true); // 1962 Earth
    expect(marked(EVENTS[2])).toBe(false); // Moon: same region as Earth
    expect(marked(EVENTS[4])).toBe(true); // Mars: a new region
    expect(marked(EVENTS[6])).toBe(true); // Jupiter: a new region
    expect(marked(EVENTS[8])).toBe(false); // Io: region already reached
    expect(marked(EVENTS[7])).toBe(true); // conversion to subspace
  });

  it('marks the Moon and Mars being colonized and the first million-person worlds', () => {
    expect(marked(EVENTS[3])).toBe(true);
    expect(marked(EVENTS[5])).toBe(true);
    expect(marked(EVENTS[11])).toBe(false); // Io colonized: not a headline
    expect(marked(EVENTS[12])).toBe(true);
  });

  it('marks regional carriers being founded, but not gateways or backbones', () => {
    expect(marked(EVENTS[9])).toBe(true);
    expect(marked(EVENTS[10])).toBe(false);
    expect(marked(EVENTS[1])).toBe(false);
  });
});

describe('describeEvent', () => {
  const names = {
    world: (id: string) => WORLDS.find((w) => w.id === id)?.name ?? id,
    company: (id: string) => COMPANIES.find((c) => c.id === id)?.name ?? id,
  };
  it('says what happened in plain text for every event type', () => {
    expect(describeEvent(EVENTS[0], names).title).toBe('Earth: first relay constellation, at light speed');
    expect(describeEvent(EVENTS[7], names).title).toBe('Earth: network converted to subspace');
    expect(describeEvent(EVENTS[8], names).title).toBe('Io: subspace constellation');
    expect(describeEvent(EVENTS[3], names).title).toBe('Moon colonized');
    expect(describeEvent(EVENTS[12], names).title).toBe('Mars passes one million people');
    expect(describeEvent(EVENTS[9], names).title).toBe('Cassini Link founded');
    expect(describeEvent(EVENTS[13], names).title).toBe('Terran Transit acquires Cassini Link');
  });

  it('includes the simulation detail when there is one', () => {
    expect(describeEvent(ev(2150, 'colonized', 'mars', { detail: 'from Utopia Planitia' }), names).detail).toBe(
      'from Utopia Planitia',
    );
  });
});

describe('buildTimeline', () => {
  const build = (groups: ReadonlySet<GroupId>, milestonesOnly = false) =>
    buildTimeline(EVENTS, { groups, milestonesOnly }, milestoneKeys(EVENTS, WORLDS, COMPANIES));

  it('groups events by era and year, in order, with canon markers included', () => {
    const eras = build(ALL);
    expect(eras.map((e) => e.era.id)).toEqual(['pre-subspace', 'early-subspace', 'expansion', 'mature-market']);
    const years = eras.flatMap((e) => e.years.map((y) => y.year));
    expect(years).toEqual([...years].sort((a, b) => a - b));
    expect(new Set(years).size).toBe(years.length);
    const markerYears = CANON_MARKERS.map((m) => m.year);
    for (const year of markerYears) expect(years).toContain(year);
    expect(eras[0].years.find((y) => y.year === 1962)?.items).toHaveLength(2);
  });

  it('filters by group, but always keeps the canon markers', () => {
    const companiesOnly = build(new Set<GroupId>(['companies']));
    const items = companiesOnly.flatMap((e) => e.years.flatMap((y) => y.items));
    expect(items.filter((i) => !i.canon).every((i) => i.type.startsWith('company-'))).toBe(true);
    expect(items.some((i) => i.canon)).toBe(true);
  });

  it('can show only key milestones', () => {
    const items = build(ALL, true).flatMap((e) => e.years.flatMap((y) => y.items));
    expect(items.filter((i) => !i.canon).every((i) => i.milestone)).toBe(true);
    expect(items.length).toBeLessThan(EVENTS.length);
  });

  it('drops eras and years that end up empty', () => {
    const eras = build(new Set<GroupId>(['subspace']));
    for (const era of eras) for (const year of era.years) expect(year.items.length).toBeGreaterThan(0);
  });
});
