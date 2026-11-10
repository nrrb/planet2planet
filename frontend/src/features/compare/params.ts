import type { QuoteParams } from '../../api/client';
import { SORT_LABELS, type SortKey } from '../../content/labels';

/** Everything about the Compare view that is shareable lives in the URL. */
export interface CompareState {
  from: string | null;
  to: string | null;
  sort: SortKey;
  classes: string[];
  sectors: string[];
  tiers: string[];
  kinds: string[];
  companies: string[];
  envs: string[];
  maxLatencyMs: number | null;
  reroute: boolean;
  /** Offer whose details panel is open. */
  offer: string | null;
  /** Offers chosen for side-by-side comparison (at most three). */
  compare: string[];
}

export const MAX_COMPARE = 3;
export const DEFAULT_SORT: SortKey = 'price';

const list = (value: string | null): string[] => (value ? value.split(',').filter(Boolean) : []);
const isSort = (value: string | null): value is SortKey => value !== null && value in SORT_LABELS;

export function parseCompareParams(search: URLSearchParams): CompareState {
  const max = Number(search.get('maxLatencyMs'));
  const sort = search.get('sort');
  return {
    from: search.get('from'),
    to: search.get('to'),
    sort: isSort(sort) ? sort : DEFAULT_SORT,
    classes: list(search.get('class')),
    sectors: list(search.get('sector')),
    tiers: list(search.get('tier')),
    kinds: list(search.get('kind')),
    companies: list(search.get('company')),
    envs: list(search.get('env')),
    maxLatencyMs: search.get('maxLatencyMs') && Number.isFinite(max) && max > 0 ? max : null,
    reroute: search.get('reroute') === 'true',
    offer: search.get('offer'),
    compare: list(search.get('cmp')).slice(0, MAX_COMPARE),
  };
}

/** Defaults are left out so shared links stay short. */
export function toSearchParams(state: CompareState): URLSearchParams {
  const out = new URLSearchParams();
  if (state.from) out.set('from', state.from);
  if (state.to) out.set('to', state.to);
  if (state.sort !== DEFAULT_SORT) out.set('sort', state.sort);
  const lists: [string, string[]][] = [
    ['class', state.classes],
    ['sector', state.sectors],
    ['tier', state.tiers],
    ['kind', state.kinds],
    ['company', state.companies],
    ['env', state.envs],
  ];
  for (const [key, values] of lists) if (values.length) out.set(key, values.join(','));
  if (state.maxLatencyMs !== null) out.set('maxLatencyMs', String(state.maxLatencyMs));
  if (state.reroute) out.set('reroute', 'true');
  if (state.offer) out.set('offer', state.offer);
  if (state.compare.length) out.set('cmp', state.compare.join(','));
  return out;
}

/** The part of the state the server needs. Null until two different worlds are chosen. */
export function quoteParamsFrom(state: CompareState): QuoteParams | null {
  if (!state.from || !state.to || state.from === state.to) return null;
  return {
    from: state.from,
    to: state.to,
    sort: state.sort,
    class: state.classes,
    sector: state.sectors,
    tier: state.tiers,
    kind: state.kinds,
    company: state.companies,
    env: state.envs,
    maxLatencyMs: state.maxLatencyMs ?? undefined,
    reroute: state.reroute,
  };
}

export function activeFilterCount(state: CompareState): number {
  return (
    state.classes.length +
    state.sectors.length +
    state.tiers.length +
    state.kinds.length +
    state.companies.length +
    state.envs.length +
    (state.maxLatencyMs !== null ? 1 : 0) +
    (state.reroute ? 1 : 0)
  );
}

export function withoutFilters(state: CompareState): CompareState {
  return {
    ...state,
    classes: [],
    sectors: [],
    tiers: [],
    kinds: [],
    companies: [],
    envs: [],
    maxLatencyMs: null,
    reroute: false,
  };
}

/** Choose a world for one end. The other end can never hold the same world. */
export function chooseWorld(state: CompareState, end: 'from' | 'to', world: string): CompareState {
  const other = end === 'from' ? 'to' : 'from';
  return { ...state, [end]: world, [other]: state[other] === world ? null : state[other], offer: null, compare: [] };
}

export function swapWorlds(state: CompareState): CompareState {
  return { ...state, from: state.to, to: state.from, offer: null, compare: [] };
}

export function toggleCompare(state: CompareState, offerId: string): CompareState {
  if (state.compare.includes(offerId)) return { ...state, compare: state.compare.filter((id) => id !== offerId) };
  if (state.compare.length >= MAX_COMPARE) return state;
  return { ...state, compare: [...state.compare, offerId] };
}
