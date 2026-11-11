import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { chooseWorld, toggleCompare } from './params';
import { useCompareParams } from './useCompareParams';

function wrap(path: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>;
  };
}

describe('useCompareParams', () => {
  it('applies two changes made before a re-render, instead of the second overwriting the first', () => {
    const { result } = renderHook(() => useCompareParams(), { wrapper: wrap('/?from=jupiter&to=saturn') });
    act(() => {
      const update = result.current[1];
      update((s) => chooseWorld(s, 'from', 'earth'));
      update((s) => chooseWorld(s, 'to', 'mars'));
    });
    expect(result.current[0]).toMatchObject({ from: 'earth', to: 'mars' });
  });

  it('applies a run of quick toggles', () => {
    const { result } = renderHook(() => useCompareParams(), { wrapper: wrap('/?from=jupiter&to=saturn') });
    act(() => {
      const update = result.current[1];
      for (const id of ['a', 'b', 'c']) update((s) => toggleCompare(s, id));
    });
    expect(result.current[0].compare).toEqual(['a', 'b', 'c']);
  });

  it('follows the URL when it changes by other means', () => {
    const { result } = renderHook(() => useCompareParams(), { wrapper: wrap('/?from=moon&to=titan&sort=latency') });
    expect(result.current[0]).toMatchObject({ from: 'moon', to: 'titan', sort: 'latency' });
    act(() => result.current[1]((s) => ({ ...s, sort: 'hops' })));
    expect(result.current[0].sort).toBe('hops');
    expect(result.current[0].from).toBe('moon');
  });
});
