import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AboutPage from './AboutPage';

// The renderer needs WebGL; the map has its own tests.
vi.mock('../map/MapView', () => ({ default: () => null }));

const world = (id: string) => ({
  id,
  name: id,
  region: 'x',
  type: 'planet',
  parent: null,
  eligible: true,
  radiusKm: 1,
});
const WORLDS = ['earth', 'moon', 'mars', 'jupiter', 'eris'].map(world);
const COMPANIES = [
  { id: 'a', name: 'Alpha', kind: 'backbone', status: 'active', worldIds: ['earth'] },
  { id: 'b', name: 'Beta', kind: 'regional', status: 'active', worldIds: ['mars'] },
  { id: 'c', name: 'Merged Co', kind: 'regional', status: 'merged', worldIds: [] },
];
const DETAIL: Record<string, unknown> = {
  moon: { subspaceLatencyToEarthMs: { min: 0.0247, max: 0.0247 } },
  mars: { subspaceLatencyToEarthMs: { min: 5.03, max: 24.22 } },
  jupiter: { subspaceLatencyToEarthMs: { min: 40.34, max: 59.54 } },
  eris: { subspaceLatencyToEarthMs: { min: 641.6, max: 660.8 } },
};
const META = {
  title: 't',
  siteDate: '2380-06-09',
  stardate: '57436.2',
  year: 2380,
  subspaceSpeedC: 52000,
  sources: [
    {
      id: 'ma-subspace',
      title: 'Memory Alpha: Subspace communication',
      url: 'https://memory-alpha.fandom.com/wiki/Subspace_communication',
    },
  ],
};
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function renderAbout() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/about']}>
        <AboutPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      const detail = /^\/api\/worlds\/([a-z-]+)\/$/.exec(input);
      if (detail) return Promise.resolve(json(DETAIL[detail[1]] ?? { subspaceLatencyToEarthMs: { min: 0, max: 0 } }));
      if (input.startsWith('/api/worlds/')) return Promise.resolve(json(WORLDS));
      if (input.startsWith('/api/companies/')) return Promise.resolve(json(COMPANIES));
      if (input.startsWith('/api/meta/')) return Promise.resolve(json(META));
      if (input.startsWith('/api/history/')) return Promise.resolve(json([]));
      if (input.startsWith('/api/network/')) return Promise.resolve(json({ nodes: [], links: [], orbits: {} }));
      if (input.startsWith('/api/regions/')) return Promise.resolve(json([]));
      return Promise.resolve(new Response('{}', { status: 404 }));
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('AboutPage', () => {
  it('has the sections the plan lists, each reachable from the contents list', async () => {
    renderAbout();
    const toc = screen.getByRole('navigation', { name: 'On this page' });
    for (const name of [
      'Overview',
      'History of the networks',
      'The network today',
      'How subspace works',
      'Built for bad days',
      'Sources and disclaimer',
    ]) {
      expect(within(toc).getByRole('link', { name })).toBeInTheDocument();
    }
    expect(
      await screen.findByRole('heading', { name: /Keeping a business connected across 5 worlds/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What Planet2Planet does' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'A short history of Sol’s networks' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The network today' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Built for bad days' })).toBeInTheDocument();
  });

  it('counts the brands that are actually trading, not the merged ones', async () => {
    renderAbout();
    expect(await screen.findByText(/they face 2 trading brands/)).toBeInTheDocument();
  });

  it('computes the subspace examples from the API, with light-speed radio beside them', async () => {
    renderAbout();
    const table = await screen.findByRole('table', { name: /One-way delay from Earth/ });
    const eris = (await within(table).findByRole('rowheader', { name: 'Earth to Eris' })).closest('tr') as HTMLElement;
    expect(within(eris).getByText('642 ms to 661 ms')).toBeInTheDocument();
    expect(within(eris).getByText(/hours to .* hours/)).toBeInTheDocument();
    const moon = within(table).getByRole('rowheader', { name: 'Earth to the Moon' }).closest('tr') as HTMLElement;
    expect(within(moon).getByText('about 0.025 ms')).toBeInTheDocument();
    expect(within(moon).getByText('about 1.3 seconds')).toBeInTheDocument();
  });

  it('lists the five resilience tiers with checked canon, and no claim that a Changeling did it', () => {
    renderAbout();
    const table = screen.getByRole('table', { name: 'Redundancy tiers and the events behind them' });
    for (const tier of ['Standard', 'Diverse path', 'Hardened', 'Contingency', 'Terraforming-zone protection']) {
      expect(within(table).getByRole('rowheader', { name: tier })).toBeInTheDocument();
    }
    const hardened = within(table).getByRole('rowheader', { name: 'Hardened' }).closest('tr') as HTMLElement;
    expect(hardened).toHaveTextContent('Red Squad');
    expect(table).not.toHaveTextContent(/Changeling/);
    expect(table).toHaveTextContent('Wolf 359');
  });

  it('opens sources in a new tab and links to the Canon page', async () => {
    renderAbout();
    const link = await screen.findByRole('link', { name: 'Memory Alpha: Subspace communication' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
    expect(screen.getByRole('link', { name: 'Read how it was built' })).toHaveAttribute('href', '/canon');
    expect(screen.getByText(/unofficial fan work/)).toBeInTheDocument();
  });
});
