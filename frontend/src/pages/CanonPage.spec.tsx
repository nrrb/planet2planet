import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CanonPage from './CanonPage';

const SOURCE = {
  id: 'ma-subspace',
  title: 'Memory Alpha: Subspace communication',
  url: 'https://memory-alpha.fandom.com/wiki/Subspace_communication',
};
const fact = (id: string, category: string, extra: Record<string, unknown> = {}) => ({
  id,
  category,
  topic: `Topic ${id}`,
  world: null,
  statement: `Statement ${id}`,
  episodes: ['ENT: Fortunate Son', 'TNG: Aquiel'],
  howUsed: `How ${id}`,
  standing: category === 'set-aside' ? 'reference-book' : 'on-screen',
  source: SOURCE,
  deadline: null,
  ...extra,
});
const FACTS: Record<string, unknown[]> = {
  'starting-condition': [fact('start-1', 'starting-condition')],
  deadline: [
    fact('titan-mine', 'deadline', {
      deadline: { event: 'colonized', year: 2259, threshold: null, shareMet: 1, medianResult: 2190 },
    }),
    fact('moon-50m', 'deadline', {
      deadline: { event: 'population', year: 2373, threshold: 50_000_000, shareMet: 1, medianResult: 54_410_117 },
    }),
  ],
  'set-aside': [fact('aside-1', 'set-aside', { episodes: [] })],
};
const SIMULATION = {
  run: {
    firstSeed: 1000,
    runCount: 400,
    startYear: 2151,
    endYear: 2380,
    scriptCommit: 'f115c203b6caf71e22b8af776bc0a6d9ead0f5c4',
    generatedAt: '2026-11-10T23:09:08Z',
    canonicalSeed: 1701,
  },
  market: [],
};
const META = {
  title: 't',
  siteDate: '2380-06-09',
  stardate: '57436.2',
  year: 2380,
  subspaceSpeedC: 52000,
  sources: [SOURCE, { id: 'jpl-planets', title: 'JPL', url: 'https://ssd.jpl.nasa.gov/' }],
};
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function renderCanon() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <CanonPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      const category = /category=([a-z-]+)/.exec(input)?.[1];
      if (input.startsWith('/api/canon/facts/')) return Promise.resolve(json(FACTS[category ?? ''] ?? []));
      if (input.startsWith('/api/simulation/worlds/')) return Promise.resolve(json([]));
      if (input.startsWith('/api/simulation/')) return Promise.resolve(json(SIMULATION));
      if (input.startsWith('/api/meta/')) return Promise.resolve(json(META));
      return Promise.resolve(new Response('{}', { status: 404 }));
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('CanonPage', () => {
  it('has the sections of the plan, in order, each reachable from the contents list', () => {
    renderCanon();
    const toc = screen.getByRole('navigation', { name: 'On this page' });
    const names = within(toc)
      .getAllByRole('link')
      .map((a) => a.textContent);
    expect(names).toEqual([
      'Built on canon',
      'The worlds',
      'What canon fixes',
      'How the simulation works',
      'Monte Carlo',
      'Results across the runs',
      'What is invented',
      'Sources and downloads',
    ]);
    for (const heading of [
      'Built on canon, filled in by simulation',
      'The worlds',
      'What canon fixes',
      'How the simulation works',
      'What is invented',
      'Sources and downloads',
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
  });

  it('shows all three fact tables with episode names and Memory Alpha links that open in a new tab', async () => {
    renderCanon();
    const starting = await screen.findByRole('table', { name: /fixed/ });
    expect(within(starting).getByText('ENT: Fortunate Son; TNG: Aquiel')).toBeInTheDocument();
    const link = within(starting).getByRole('link', { name: 'Memory Alpha: Subspace communication' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('href', SOURCE.url);
    expect(within(starting).getByText('(opens in a new tab)')).toBeInTheDocument();

    const deadlines = await screen.findByRole('table', { name: /latest date canon allows/ });
    expect(within(deadlines).getAllByText('100% of runs')).toHaveLength(2);
    expect(within(deadlines).getByText('Colonized 2190')).toBeInTheDocument();
    expect(within(deadlines).getByText('54 million')).toBeInTheDocument();
    expect(within(deadlines).getByText('50 million by 2373')).toBeInTheDocument();

    const aside = await screen.findByRole('table', { name: 'Claims that were left out, and why' });
    expect(within(aside).getByText('Reference book')).toBeInTheDocument();
    expect(within(aside).getByText('No single episode')).toBeInTheDocument();
  });

  it('says which seeds the 400 runs used', async () => {
    renderCanon();
    expect(await screen.findByText(/400 runs, seeds 1000 to 1399/)).toBeInTheDocument();
  });

  it('names the script at the recorded commit', async () => {
    renderCanon();
    expect(await screen.findByText('f115c20')).toBeInTheDocument();
    expect(screen.getAllByText('tools/colonization-sim.js').length).toBeGreaterThan(0);
  });

  it('labels what is on screen, invented and real, in words', () => {
    renderCanon();
    expect(screen.getAllByText('On screen').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Invented').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Real astronomy').length).toBeGreaterThan(0);
  });

  it('lists the Memory Alpha sources and the fan disclaimer', async () => {
    renderCanon();
    const list = await screen.findByRole('list', { name: 'Memory Alpha sources' });
    expect(within(list).getAllByRole('link')).toHaveLength(1); // JPL is not a Memory Alpha source
    expect(screen.getByText(/Star Trek and related marks belong to their owners/)).toBeInTheDocument();
  });
});
