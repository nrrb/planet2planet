/**
 * Answers the site's data requests in the browser. The client asks for the same paths the old
 * server served (`/api/quotes/?from=jupiter&to=saturn`), and this module computes the reply.
 */

import { ApiError } from '../api/errors';
import { loadCanon, loadEngine, networkView, quoteFor } from './index';
import type { QuoteQuery } from './quotes';

/** The part of a fetch Response the client uses. */
export interface Reply {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

const reply = (status: number, body: unknown): Reply => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
});

const list = (params: URLSearchParams, name: string): string[] | undefined =>
  params.has(name) ? params.getAll(name) : undefined;

function quoteQuery(params: URLSearchParams): QuoteQuery {
  const max = params.get('maxLatencyMs');
  return {
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    sort: params.get('sort') ?? undefined,
    class: list(params, 'class'),
    sector: list(params, 'sector'),
    tier: list(params, 'tier'),
    kind: list(params, 'kind'),
    company: list(params, 'company'),
    env: list(params, 'env'),
    maxLatencyMs: max === null ? undefined : Number(max),
    reroute: params.get('reroute') === 'true',
  };
}

async function route(path: string): Promise<unknown> {
  const url = new URL(path, 'http://site.invalid');
  const p = url.pathname.replace(/\/+$/, '');
  const q = url.searchParams;

  if (p === '/api/quotes') return quoteFor(quoteQuery(q));
  if (p.startsWith('/api/canon') || p.startsWith('/api/simulation')) {
    const canon = await loadCanon();
    if (p === '/api/canon/facts') return canon.canonFacts(q.get('category') ?? undefined);
    if (p === '/api/simulation') return canon.simulation();
    if (p === '/api/simulation/worlds') {
      return canon.worldStatistics(
        q.get('metric') ?? undefined,
        q.get('world') ?? undefined,
        q.get('samples') === 'true',
      );
    }
  } else {
    const engine = await loadEngine();
    const { catalog } = engine;
    if (p === '/api/worlds') return catalog.worldList();
    if (p.startsWith('/api/worlds/')) return catalog.worldDetail(decodeURIComponent(p.slice('/api/worlds/'.length)));
    if (p === '/api/network') return networkView(engine);
    if (p === '/api/meta') return catalog.meta();
    if (p === '/api/history') return catalog.history();
    if (p === '/api/regions') return catalog.regions();
    if (p === '/api/companies') return catalog.companyList();
  }
  throw new ApiError('Not found.', 404);
}

/** Handles one request. Errors become replies with a status, as a server's would. */
export async function handle(path: string): Promise<Reply> {
  try {
    return reply(200, await route(path));
  } catch (error) {
    if (error instanceof ApiError) return reply(error.status, error.fields);
    throw error;
  }
}
