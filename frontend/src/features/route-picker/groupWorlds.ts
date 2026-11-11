import { SUN_ORBIT_ORDER } from '../../config';
import type { World } from '../../api/types';

export interface WorldGroup {
  label: string;
  worlds: World[];
}

const byName = (a: World, b: World) => a.name.localeCompare(b.name);

/** Sun-orbiting worlds first, then one group per planet's moons. */
export function groupWorlds(worlds: World[]): WorldGroup[] {
  const rank = (id: string) => {
    const index = SUN_ORBIT_ORDER.indexOf(id);
    return index === -1 ? SUN_ORBIT_ORDER.length : index;
  };
  const sunOrbiting = worlds.filter((w) => w.parent === null).sort((a, b) => rank(a.id) - rank(b.id));
  const groups: WorldGroup[] = [{ label: 'Orbiting the Sun', worlds: sunOrbiting }];
  for (const parent of sunOrbiting) {
    const moons = worlds.filter((w) => w.parent === parent.id).sort(byName);
    if (moons.length) groups.push({ label: `Moons of ${parent.name}`, worlds: moons });
  }
  return groups;
}
