import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Company, Offer, QuoteResponse, Region, World } from '../api/types';
import { ComparePage } from './ComparePage';

const WORLDS: World[] = [
  { id: 'jupiter', name: 'Jupiter', type: 'planet', parent: null, region: 'jovian', eligible: true, radiusKm: 1000 },
  { id: 'saturn', name: 'Saturn', type: 'planet', parent: null, region: 'saturnian', eligible: true, radiusKm: 1000 },
  { id: 'earth', name: 'Earth', type: 'planet', parent: null, region: 'earth-luna', eligible: true, radiusKm: 1000 },
];
const REGIONS = [{ id: 'jovian', name: 'Jovian', order: 4, worldIds: [] }] as Region[];
const COMPANIES = [
  { id: 'jovian-subspace', name: 'Jovian Subspace', status: 'active', kind: 'backbone', worldIds: [] },
] as unknown as Company[];

const offer = (id: string, title: string, monthly: number): Offer => ({
  id,
  title,
  kind: 'end-to-end',
  leadCompanyId: 'jovian-subspace',
  ownerId: null,
  partnerIds: [],
  planIds: [],
  serviceClass: 'shared',
  throughput: 10,
  resilienceTier: 'standard',
  conjunction: 'degraded',
  environments: [],
  sectors: ['commercial'],
  hops: 3,
  handoffs: 0,
  onNetworkShare: 1,
  latencyMs: { now: 72.6, min: 72.6, max: 87.7 },
  price: { monthly, setup: 300, currency: 'credits', breakdown: [], terms: {} },
  segments: [],
  addons: [],
  badges: id === 'a' ? ['lowest-price'] : [],
});

const QUOTE: QuoteResponse = {
  route: {
    from: 'jupiter',
    to: 'saturn',
    date: '2380-06-09',
    stardate: '57436.2',
    distanceKm: 1_092_764_447,
    latencyMs: { direct: 70.1, min: 70.1, max: 85.2 },
    regions: ['jovian'],
    providers: 7,
    independentCarriers: 6,
    conjunction: { activeNow: false, nextStart: null, nextEnd: null },
  },
  offers: [offer('a', 'Transit Shared', 624), offer('b', 'Transit Dedicated', 1316)],
};

let quoteHandler: (url: string) => Response;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function Location() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{pathname + search}</output>;
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <ComparePage />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  quoteHandler = () => json(QUOTE);
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      if (input.startsWith('/api/worlds/')) return Promise.resolve(json(WORLDS));
      if (input.startsWith('/api/regions/')) return Promise.resolve(json(REGIONS));
      if (input.startsWith('/api/companies/')) return Promise.resolve(json(COMPANIES));
      if (input.startsWith('/api/quotes/')) return Promise.resolve(quoteHandler(input));
      return Promise.resolve(json({}, 404));
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('ComparePage', () => {
  it('opens on Jupiter to Saturn when the URL has no worlds', async () => {
    renderAt('/');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/?from=jupiter&to=saturn'));
  });

  it('shows the plan count, the best-offer badge and the stardate', async () => {
    renderAt('/?from=jupiter&to=saturn');
    expect(await screen.findByText('2 plans from Jupiter to Saturn')).toBeInTheDocument();
    expect(screen.getByText('Lowest price')).toBeInTheDocument();
    expect(screen.getByText('Stardate 57436.2')).toBeInTheDocument();
  });

  it('puts the chosen worlds, filters and sort in the URL', async () => {
    renderAt('/?from=jupiter&to=saturn');
    await screen.findByText('2 plans from Jupiter to Saturn');
    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'latency');
    expect(screen.getByTestId('location')).toHaveTextContent('sort=latency');
  });

  it('restores a shared view from its URL', async () => {
    renderAt('/?from=jupiter&to=saturn&sort=tier&class=dedicated');
    await screen.findByText('2 plans from Jupiter to Saturn');
    expect(screen.getByLabelText('Sort by')).toHaveValue('tier');
    const urls = vi.mocked(fetch).mock.calls.map((call) => call[0] as string);
    expect(urls.some((u) => u.includes('sort=tier') && u.includes('class=dedicated'))).toBe(true);
  });

  it('says so and offers a reset when filters match nothing', async () => {
    quoteHandler = () => json({ ...QUOTE, offers: [] });
    renderAt('/?from=jupiter&to=saturn&class=dedicated');
    expect(await screen.findByText('No plans match these filters')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reset filters', hidden: false }));
    expect(screen.getByTestId('location')).not.toHaveTextContent('class=');
  });

  it('shows an error with a retry button when the API fails', async () => {
    let calls = 0;
    quoteHandler = () => {
      calls += 1;
      // The app retries once, so the first two calls must fail to surface the error.
      return calls <= 2 ? json({}, 500) : json(QUOTE);
    };
    renderAt('/?from=jupiter&to=saturn');
    // Retrying takes about a second before the error is shown.
    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent('The request failed (500).');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('2 plans from Jupiter to Saturn')).toBeInTheDocument();
  });

  it('keeps at most three plans for comparison', async () => {
    quoteHandler = () =>
      json({ ...QUOTE, offers: ['a', 'b', 'c', 'd'].map((id, i) => offer(id, `Plan ${id}`, 100 + i)) });
    renderAt('/?from=jupiter&to=saturn');
    await screen.findByText('4 plans from Jupiter to Saturn');
    for (const id of ['a', 'b', 'c'])
      await userEvent.click(screen.getByRole('checkbox', { name: `Compare Plan ${id}` }));
    expect(screen.getByRole('checkbox', { name: 'Compare Plan d' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Compare 3 plans' })).toBeInTheDocument();
  });
});
