import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldStatistic } from '../../api/types';
import { PopulationChart, populationRows, SettlementChart, settlementRows } from './ResultCharts';
import { StripPlot } from './StripPlot';

const stat = (
  world: string,
  metric: string,
  median: number | null,
  p10: number | null,
  p90: number | null,
  shareOfRuns = 1,
  extra: object = {},
): WorldStatistic => ({ world, metric, median, p10, p90, shareOfRuns, canonical: median, ...extra });

const SUBSPACE = [
  stat('earth', 'subspace', 2151, 2151, 2151),
  stat('titan', 'subspace', 2170, 2165, 2178),
  stat('mars', 'subspace', 2155, 2155, 2155),
];
const COLONIZED = [
  stat('earth', 'colonized', null, null, null, 0),
  stat('titan', 'colonized', 2190, 2175, 2205),
  stat('mars', 'colonized', 2103, 2103, 2103),
];
const POPULATION = [
  stat('titan', 'population', 21_000_000, 19_000_000, 24_000_000),
  stat('mars', 'population', 152_000_000, 150e6, 155e6),
  stat('venus', 'population', 20_000, 20_000, 20_000),
  stat('earth', 'population', null, null, null, 0),
];
const MILLION = [
  stat('titan', 'one-million', 2250, 2240, 2262),
  stat('mars', 'one-million', 2210, 2200, 2220),
  stat('venus', 'one-million', null, null, null, 0),
  stat('io', 'one-million', 2330, 2300, 2360, 0.3),
];

describe('settlementRows', () => {
  it('orders worlds by colony year (the subspace year for the homeworld, which has no colony) and joins the subspace year', () => {
    const rows = settlementRows(SUBSPACE, COLONIZED);
    expect(rows.map((r) => r.world)).toEqual(['mars', 'earth', 'titan']);
    expect(rows[2]).toMatchObject({ subspace: 2170, colony: 2190, p10: 2175, p90: 2205 });
    expect(rows[1].colony).toBeNull();
  });
});

describe('populationRows', () => {
  const rows = populationRows(POPULATION, MILLION);
  it('puts the biggest first and leaves out worlds with no population', () => {
    expect(rows.map((r) => r.world)).toEqual(['mars', 'titan', 'venus']);
  });
  it('reports the million year only where most runs got there', () => {
    expect(rows.find((r) => r.world === 'titan')?.millionYear).toBe(2250);
    expect(rows.find((r) => r.world === 'venus')?.millionYear).toBeNull();
  });
});

const WORLDS = ['titan', 'mars', 'earth', 'venus'].map((id) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  region: 'x',
  type: 'planet',
  parent: null,
  eligible: true,
  radiusKm: 1,
}));
const SAMPLES = [2175, 2188, 2188, 2190, 2190, 2190, 2205];
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function wrap(node: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {node}
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      if (input.startsWith('/api/worlds/')) return Promise.resolve(json(WORLDS));
      const url = new URL(input, 'http://x');
      const metric = url.searchParams.get('metric');
      const world = url.searchParams.get('world');
      const table: Record<string, WorldStatistic[]> = {
        subspace: SUBSPACE,
        colonized: COLONIZED,
        population: POPULATION,
        'one-million': MILLION,
      };
      if (world)
        return Promise.resolve(
          json([{ ...stat(world, metric ?? '', 2190, 2175, 2205), canonical: 2187, samples: SAMPLES }]),
        );
      return Promise.resolve(json(table[metric ?? ''] ?? []));
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('charts', () => {
  it('the settlement chart can be shown as a table, and back', async () => {
    wrap(<SettlementChart />);
    const chart = await screen.findByRole('img', { name: /Median year of each world/ });
    expect(chart).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    const table = screen.getByRole('table', { name: 'Median years of settlement by world' });
    expect(within(table).getByRole('rowheader', { name: 'Titan' }).closest('tr')).toHaveTextContent('2170');
    expect(screen.queryByRole('img', { name: /Median year of each world/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show as chart' }));
    expect(screen.getByRole('img', { name: /Median year of each world/ })).toBeInTheDocument();
  });

  it('the population chart can be shown as a table with the million year', async () => {
    wrap(<PopulationChart />);
    await screen.findByRole('img', { name: /Median population of each world/ });
    await userEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    const table = screen.getByRole('table', { name: /Median population in 2380/ });
    const titan = within(table).getByRole('rowheader', { name: 'Titan' }).closest('tr') as HTMLElement;
    expect(titan).toHaveTextContent('21 million');
    expect(titan).toHaveTextContent('2250');
  });

  it('the strip plot starts on Titan, shows one dot per run, and changes with the picked world', async () => {
    wrap(<StripPlot canonicalSeed={1701} />);
    const plot = await screen.findByRole('img', { name: /Titan: colonized between 2175 and 2205/ });
    expect(plot.querySelectorAll('circle')).toHaveLength(SAMPLES.length);
    expect(within(plot).getByText(/seed 1701: 2187/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'World' })).toHaveValue('titan');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'World' }), 'mars');
    expect(await screen.findByRole('img', { name: /Mars: colonized/ })).toBeInTheDocument();
  });

  it('the strip plot has a table view of runs by year', async () => {
    wrap(<StripPlot canonicalSeed={1701} />);
    await screen.findByRole('img', { name: /Titan/ });
    await userEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    const table = screen.getByRole('table', { name: /Runs by the year Titan was colonized/ });
    const row = within(table).getByText('2190').closest('tr') as HTMLElement;
    expect(row).toHaveTextContent('3');
  });
});
