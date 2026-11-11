import { describe, expect, it } from 'vitest';
import { activeFilterCount, parseCompareParams } from '../compare/params';
import { activeFilters } from './activeFilters';

const state = (query: string) => parseCompareParams(new URLSearchParams(`from=jupiter&to=saturn&${query}`));
const name = (id: string) => (id === 'cassini-link' ? 'Cassini Link' : id);

describe('activeFilters', () => {
  it('has one chip per active filter, matching the filter count', () => {
    const s = state(
      'class=shared,dedicated&maxLatencyMs=80&tier=contingency&company=cassini-link&env=radiation&reroute=true&sector=science&kind=backbone',
    );
    const chips = activeFilters(s, name);
    expect(chips).toHaveLength(activeFilterCount(s));
    expect(chips.map((c) => c.label)).toEqual([
      'Class: Shared',
      'Class: Dedicated',
      'Latency ≤ 80 ms',
      'Sector: Scientific',
      'Redundancy: Contingency',
      'Kind: Backbone',
      'Provider: Cassini Link',
      'Hardened: Radiation',
      'Reroutes in conjunction',
    ]);
  });

  it('is empty with no filters', () => {
    expect(activeFilters(state(''), name)).toEqual([]);
  });

  it('removes only its own filter', () => {
    const s = state('class=shared,dedicated&reroute=true');
    const chips = activeFilters(s, name);
    expect(chips[0].remove(s).classes).toEqual(['dedicated']);
    const reroute = chips.find((c) => c.id === 'reroute');
    expect(reroute?.remove(s)).toMatchObject({ reroute: false, classes: ['shared', 'dedicated'] });
  });
});
