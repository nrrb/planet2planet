import { ApiError } from './errors';
import type {
  CanonFact,
  Company,
  HistoryEvent,
  Meta,
  Network,
  QuoteResponse,
  Region,
  Simulation,
  World,
  WorldDetail,
  WorldStatistic,
} from './types';

export { ApiError };

/** What the client needs back from a request: the shape of a fetch Response, or a computed reply. */
export interface Reply {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}
export type Transport = (path: string, init?: RequestInit) => Promise<Reply>;

/**
 * Where requests go. In the browser the site answers them itself: the engine builds the network
 * and prices plans from the data files, on demand. Tests point this at a stubbed fetch instead.
 */
let transport: Transport = async (path) => (await import('../engine/router')).handle(path);

export function setTransport(next: Transport): void {
  transport = next;
}

function fieldMessages(body: unknown): Record<string, string> {
  if (typeof body !== 'object' || body === null) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    out[key] = Array.isArray(value) ? value.map(String).join(' ') : String(value);
  }
  return out;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Reply;
  try {
    response = await transport(path, { headers: { Accept: 'application/json' }, ...init });
  } catch {
    throw new ApiError('The data could not be loaded.', 0);
  }
  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      /* not JSON */
    }
    const fields = response.status === 400 ? fieldMessages(body) : {};
    throw new ApiError(`The request failed (${response.status}).`, response.status, fields);
  }
  return (await response.json()) as T;
}

export interface QuoteParams {
  from: string;
  to: string;
  sort?: string;
  class?: string[];
  sector?: string[];
  tier?: string[];
  kind?: string[];
  company?: string[];
  env?: string[];
  maxLatencyMs?: number;
  reroute?: boolean;
}

export function quoteQuery(params: QuoteParams): string {
  const query = new URLSearchParams({ from: params.from, to: params.to });
  if (params.sort) query.set('sort', params.sort);
  for (const key of ['class', 'sector', 'tier', 'kind', 'company', 'env'] as const) {
    const values = params[key];
    if (values?.length) query.set(key, values.join(','));
  }
  if (params.maxLatencyMs !== undefined) query.set('maxLatencyMs', String(params.maxLatencyMs));
  if (params.reroute) query.set('reroute', 'true');
  return query.toString();
}

export const api = {
  worlds: () => request<World[]>('/api/worlds/'),
  world: (id: string) => request<WorldDetail>(`/api/worlds/${encodeURIComponent(id)}/`),
  network: () => request<Network>('/api/network/'),
  meta: () => request<Meta>('/api/meta/'),
  history: () => request<HistoryEvent[]>('/api/history/'),
  canonFacts: (category?: string) =>
    request<CanonFact[]>(`/api/canon/facts/${category ? `?category=${encodeURIComponent(category)}` : ''}`),
  simulation: () => request<Simulation>('/api/simulation/'),
  worldStatistics: (metric: string, world?: string) =>
    request<WorldStatistic[]>(
      `/api/simulation/worlds/?metric=${encodeURIComponent(metric)}${world ? `&world=${encodeURIComponent(world)}&samples=true` : ''}`,
    ),
  regions: () => request<Region[]>('/api/regions/'),
  companies: () => request<Company[]>('/api/companies/'),
  quote: (params: QuoteParams) => request<QuoteResponse>(`/api/quotes/?${quoteQuery(params)}`),
};
