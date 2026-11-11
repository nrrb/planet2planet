import { useCallback } from 'react';
import { useRegions, useWorlds } from '../../api/hooks';

/** Turns network node ids (c-jupiter, h-jovian, r-1) into readable names. */
export function useNodeLabel(): (id: string) => string {
  const worlds = useWorlds().data;
  const regions = useRegions().data;
  return useCallback(
    (id: string) => {
      if (id.startsWith('c-')) return worlds?.find((w) => w.id === id.slice(2))?.name ?? id;
      if (id.startsWith('h-')) return `${regions?.find((r) => r.id === id.slice(2))?.name ?? id.slice(2)} hub`;
      if (id.startsWith('r-')) return `Conjunction relay ${id.slice(2)}`;
      return id;
    },
    [worlds, regions],
  );
}
