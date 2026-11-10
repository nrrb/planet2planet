import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { type CompareState, parseCompareParams, toSearchParams } from './params';

/** The Compare view's state, with the URL as the single source of truth. */
export function useCompareParams(): [CompareState, (update: (state: CompareState) => CompareState) => void] {
  const [search, setSearch] = useSearchParams();
  const state = useMemo(() => parseCompareParams(search), [search]);
  const update = useCallback(
    (change: (current: CompareState) => CompareState) => {
      setSearch((previous) => toSearchParams(change(parseCompareParams(previous))));
    },
    [setSearch],
  );
  return [state, update];
}
