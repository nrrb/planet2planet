import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  chooseWorld,
  MAX_COMPARE,
  parseCompareParams,
  quoteParamsFrom,
  sortBy,
  toggleCompare,
  toSearchParams,
  withoutFilters,
} from './params';

const parse = (query: string) => parseCompareParams(new URLSearchParams(query));

describe('compare params', () => {
  it('round-trips state through the URL', () => {
    const query =
      'from=moon&to=titan&sort=latency&dir=desc&class=shared,dedicated&sector=science&tier=standard&kind=backbone&company=cassini-link&env=radiation&maxLatencyMs=80&reroute=true&offer=of_1&cmp=of_1,of_2';
    const state = parse(query);
    expect(state.classes).toEqual(['shared', 'dedicated']);
    expect(state.maxLatencyMs).toBe(80);
    expect(state.compare).toEqual(['of_1', 'of_2']);
    expect(Object.fromEntries(toSearchParams(state))).toEqual(Object.fromEntries(new URLSearchParams(query)));
  });

  it('leaves defaults out of the URL', () => {
    expect(toSearchParams(parse('from=moon&to=titan&sort=price')).toString()).toBe('from=moon&to=titan');
  });

  it('sorts by a column and reverses it on a second choice', () => {
    let state = parse('from=moon&to=titan');
    expect(state).toMatchObject({ sort: 'price', dir: 'asc' });
    state = sortBy(state, 'tier');
    expect(state).toMatchObject({ sort: 'tier', dir: 'desc' });
    state = sortBy(state, 'tier');
    expect(state).toMatchObject({ sort: 'tier', dir: 'asc' });
    expect(Object.fromEntries(toSearchParams(state))).toMatchObject({ sort: 'tier', dir: 'asc' });
    expect(toSearchParams(sortBy(sortBy(state, 'price'), 'price')).get('dir')).toBe('desc');
  });

  it('keeps sorting out of the server query', () => {
    expect(quoteParamsFrom(parse('from=moon&to=titan&sort=latency'))).not.toHaveProperty('sort');
  });

  it('ignores bad values instead of throwing', () => {
    const state = parse('sort=nonsense&maxLatencyMs=abc&cmp=a,b,c,d,e');
    expect(state.sort).toBe('price');
    expect(state.maxLatencyMs).toBeNull();
    expect(state.compare).toHaveLength(MAX_COMPARE);
  });

  it('builds quote params only for two different worlds', () => {
    expect(quoteParamsFrom(parse('from=moon'))).toBeNull();
    expect(quoteParamsFrom(parse('from=moon&to=moon'))).toBeNull();
    expect(quoteParamsFrom(parse('from=moon&to=titan&class=shared&reroute=true'))).toMatchObject({
      from: 'moon',
      to: 'titan',
      class: ['shared'],
      reroute: true,
    });
  });

  it('can never hold the same world at both ends', () => {
    const state = parse('from=moon&to=titan');
    expect(chooseWorld(state, 'from', 'titan')).toMatchObject({ from: 'titan', to: null });
    expect(chooseWorld(state, 'to', 'moon')).toMatchObject({ from: null, to: 'moon' });
    expect(chooseWorld(state, 'to', 'io')).toMatchObject({ from: 'moon', to: 'io' });
  });

  it('limits comparison to three and lets offers be removed', () => {
    let state = parse('from=moon&to=titan');
    for (const id of ['a', 'b', 'c', 'd']) state = toggleCompare(state, id);
    expect(state.compare).toEqual(['a', 'b', 'c']);
    expect(toggleCompare(state, 'b').compare).toEqual(['a', 'c']);
  });

  it('counts and clears filters', () => {
    const state = parse('from=moon&to=titan&class=shared,dedicated&maxLatencyMs=50&reroute=true&sort=tier');
    expect(activeFilterCount(state)).toBe(4);
    const cleared = withoutFilters(state);
    expect(activeFilterCount(cleared)).toBe(0);
    expect(cleared.sort).toBe('tier');
  });
});
