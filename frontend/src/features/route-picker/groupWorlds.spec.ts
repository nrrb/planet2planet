import { describe, expect, it } from 'vitest';
import type { World } from '../../api/types';
import { groupWorlds } from './groupWorlds';

const world = (id: string, name: string, parent: string | null = null): World => ({
  id,
  name,
  type: parent ? 'moon' : 'planet',
  parent,
  region: 'x',
  eligible: true,
  radiusKm: 1000,
});

describe('groupWorlds', () => {
  it('puts Sun-orbiting worlds first in orbit order, then moons by parent', () => {
    const groups = groupWorlds([
      world('titan', 'Titan', 'saturn'),
      world('saturn', 'Saturn'),
      world('earth', 'Earth'),
      world('moon', 'Moon', 'earth'),
      world('io', 'Io', 'jupiter'),
      world('jupiter', 'Jupiter'),
      world('mercury', 'Mercury'),
    ]);
    expect(groups.map((g) => g.label)).toEqual([
      'Orbiting the Sun',
      'Moons of Earth',
      'Moons of Jupiter',
      'Moons of Saturn',
    ]);
    expect(groups[0].worlds.map((w) => w.id)).toEqual(['mercury', 'earth', 'jupiter', 'saturn']);
  });

  it('skips parents without moons', () => {
    expect(groupWorlds([world('mars', 'Mars')])).toHaveLength(1);
  });
});
