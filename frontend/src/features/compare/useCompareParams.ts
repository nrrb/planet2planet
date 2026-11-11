import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { type CompareState, parseCompareParams, toSearchParams } from './params';

/**
 * The Compare view's state, with the URL as the single source of truth.
 *
 * React Router's setSearchParams(fn) is not a queue: two changes made before a re-render both
 * start from the same stale URL, so the second would overwrite the first. Each change therefore
 * builds on the latest URL held in a ref, which is also kept in step with real navigation.
 */
export function useCompareParams(): [CompareState, (update: (state: CompareState) => CompareState) => void] {
  const [search, setSearch] = useSearchParams();
  const state = useMemo(() => parseCompareParams(search), [search]);
  const latest = useRef(search.toString());
  useEffect(() => {
    latest.current = search.toString();
  }, [search]);

  const update = useCallback(
    (change: (current: CompareState) => CompareState) => {
      const next = toSearchParams(change(parseCompareParams(new URLSearchParams(latest.current))));
      latest.current = next.toString();
      setSearch(next);
    },
    [setSearch],
  );
  return [state, update];
}
