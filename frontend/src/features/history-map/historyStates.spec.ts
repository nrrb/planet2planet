import { describe, expect, it } from 'vitest';
import type { Company, HistoryEvent } from '../../api/types';
import { countsAt, latestEvents, worldStatesAt, YEAR_MAX, YEAR_MIN } from './historyStates';

const ev = (year: number, type: string, world: string, extra: Record<string, unknown> = {}): HistoryEvent => ({
  year,
  type,
  world,
  company: null,
  buyer: null,
  detail: null,
  ...extra,
});
const co = (id: string, founded: number, status: string, acquiredYear: number | null = null): Company =>
  ({ id, founded, status, acquiredYear }) as unknown as Company;

const EVENTS: HistoryEvent[] = [
  ev(1962, 'conventional-constellation', 'earth'),
  ev(2069, 'conventional-constellation', 'mars'),
  ev(2069, 'colonized', 'moon'),
  ev(2151, 'constellation-converted', 'earth'),
  ev(2156, 'subspace-constellation', 'io'),
  ev(2160, 'colonized', 'io'),
  ev(2200, 'population-one-million', 'mars'),
  ev(2205, 'population-one-million', 'io'),
];

describe('the year range', () => {
  it('runs from the first relay satellite to the snapshot year', () => {
    expect([YEAR_MIN, YEAR_MAX]).toEqual([1962, 2380]);
  });
});

describe('worldStatesAt', () => {
  it('has nothing reached before the first relay', () => {
    const states = worldStatesAt(EVENTS, 1961);
    expect([...states.values()].every((s) => s.constellation === 'none' && !s.colonized)).toBe(true);
  });

  it('shows a conventional constellation until it converts to subspace', () => {
    expect(worldStatesAt(EVENTS, 2100).get('earth')?.constellation).toBe('conventional');
    expect(worldStatesAt(EVENTS, 2150).get('earth')?.constellation).toBe('conventional');
    expect(worldStatesAt(EVENTS, 2151).get('earth')?.constellation).toBe('subspace');
    expect(worldStatesAt(EVENTS, 2300).get('mars')?.constellation).toBe('conventional'); // never converted in this fixture
  });

  it('is subspace from day one for worlds that started on subspace', () => {
    expect(worldStatesAt(EVENTS, 2155).get('io')?.constellation).toBe('none');
    expect(worldStatesAt(EVENTS, 2156).get('io')?.constellation).toBe('subspace');
  });

  it('fills in a colony from the year it was founded', () => {
    expect(worldStatesAt(EVENTS, 2159).get('io')?.colonized).toBe(false);
    expect(worldStatesAt(EVENTS, 2160).get('io')?.colonized).toBe(true);
    expect(worldStatesAt(EVENTS, 2069).get('moon')).toEqual({ constellation: 'none', colonized: true });
  });
});

describe('countsAt', () => {
  const companies = [
    co('a', 1962, 'active'),
    co('b', 2100, 'merged', 2200),
    co('c', 2150, 'division', 2160),
    co('d', 2300, 'active'),
  ];

  it('counts worlds, constellations, million-person worlds and brands trading', () => {
    expect(countsAt(EVENTS, companies, 2150)).toEqual({
      colonized: 1,
      subspace: 0,
      conventional: 2,
      million: 0,
      brands: 3,
    });
    expect(countsAt(EVENTS, companies, 2205)).toEqual({
      colonized: 2,
      subspace: 2,
      conventional: 1,
      million: 2,
      brands: 2,
    });
  });

  it('keeps a division trading after it is bought, but not a merged company', () => {
    expect(countsAt(EVENTS, companies, 2170).brands).toBe(3); // a, b, c
    expect(countsAt(EVENTS, companies, 2250).brands).toBe(2); // a, c; b merged in 2200
  });
});

describe('latestEvents', () => {
  it('returns the most recent events up to the year, newest first', () => {
    const latest = latestEvents(EVENTS, 2160, 3);
    expect(latest.map((e) => e.year)).toEqual([2160, 2156, 2151]);
  });

  it('is empty before anything has happened', () => {
    expect(latestEvents(EVENTS, 1900, 3)).toEqual([]);
  });
});
