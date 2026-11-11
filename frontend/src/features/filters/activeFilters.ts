import {
  ENVIRONMENT_LABELS,
  KIND_LABELS,
  SECTOR_LABELS,
  SERVICE_CLASS_LABELS,
  TIER_LABELS,
} from '../../content/labels';
import type { CompareState } from '../compare/params';

export interface ActiveFilter {
  id: string;
  label: string;
  /** Returns the state without this filter. */
  remove: (state: CompareState) => CompareState;
}

const without = (list: string[], value: string) => list.filter((item) => item !== value);
const label = (labels: Record<string, string>, key: string) => labels[key] ?? key;

/** One chip per active filter, so a collapsed drawer still shows what is applied. */
export function activeFilters(state: CompareState, companyName: (id: string) => string): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  for (const value of state.classes)
    out.push({
      id: `class:${value}`,
      label: `Class: ${label(SERVICE_CLASS_LABELS, value)}`,
      remove: (s) => ({ ...s, classes: without(s.classes, value) }),
    });
  if (state.maxLatencyMs !== null)
    out.push({
      id: 'latency',
      label: `Latency ≤ ${state.maxLatencyMs} ms`,
      remove: (s) => ({ ...s, maxLatencyMs: null }),
    });
  for (const value of state.sectors)
    out.push({
      id: `sector:${value}`,
      label: `Sector: ${label(SECTOR_LABELS, value)}`,
      remove: (s) => ({ ...s, sectors: without(s.sectors, value) }),
    });
  for (const value of state.tiers)
    out.push({
      id: `tier:${value}`,
      label: `Redundancy: ${label(TIER_LABELS, value)}`,
      remove: (s) => ({ ...s, tiers: without(s.tiers, value) }),
    });
  for (const value of state.kinds)
    out.push({
      id: `kind:${value}`,
      label: `Kind: ${label(KIND_LABELS, value)}`,
      remove: (s) => ({ ...s, kinds: without(s.kinds, value) }),
    });
  for (const value of state.companies)
    out.push({
      id: `company:${value}`,
      label: `Provider: ${companyName(value)}`,
      remove: (s) => ({ ...s, companies: without(s.companies, value) }),
    });
  for (const value of state.envs)
    out.push({
      id: `env:${value}`,
      label: `Hardened: ${label(ENVIRONMENT_LABELS, value)}`,
      remove: (s) => ({ ...s, envs: without(s.envs, value) }),
    });
  if (state.reroute)
    out.push({ id: 'reroute', label: 'Reroutes in conjunction', remove: (s) => ({ ...s, reroute: false }) });
  return out;
}
