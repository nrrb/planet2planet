import type { Company, InquiryConfirmation, InquiryRequest, QuoteResponse, Region, World, WorldDetail } from './types';

/** An API error, with field messages when the server sent them (HTTP 400). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
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
  let response: Response;
  try {
    response = await fetch(path, { headers: { Accept: 'application/json' }, ...init });
  } catch {
    throw new ApiError('The server could not be reached.', 0);
  }
  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      /* not JSON */
    }
    const fields = response.status === 400 || response.status === 429 ? fieldMessages(body) : {};
    const message =
      response.status === 429
        ? 'Too many requests. Wait a minute and try again.'
        : `The request failed (${response.status}).`;
    throw new ApiError(message, response.status, fields);
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
  regions: () => request<Region[]>('/api/regions/'),
  companies: () => request<Company[]>('/api/companies/'),
  quote: (params: QuoteParams) => request<QuoteResponse>(`/api/quotes/?${quoteQuery(params)}`),
  inquire: (body: InquiryRequest) =>
    request<InquiryConfirmation>('/api/inquiries/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    }),
};
