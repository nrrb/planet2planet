import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Company, Network, World } from '../../api/types';
import { NetworkMap } from './NetworkMap';

// The renderer needs WebGL; these tests are about the controls and the data they pass on.
const view = vi.fn();
vi.mock('../../map/MapView', () => ({
  default: (props: unknown) => {
    view(props);
    return <div data-testid="map" />;
  },
}));

const WORLDS = [
  { id: 'saturn', name: 'Saturn', type: 'planet', parent: null, region: 'saturnian', eligible: true, radiusKm: 58232 },
  { id: 'titan', name: 'Titan', type: 'moon', parent: 'saturn', region: 'saturnian', eligible: true, radiusKm: 2575 },
] as World[];
const COMPANIES = [
  {
    id: 'ares',
    name: 'Ares Interplanetary',
    kind: 'backbone',
    status: 'active',
    founded: 2069,
    headquarters: 'saturn',
    focus: 'Long-haul transit',
    parent: null,
    owner: null,
    worldIds: ['saturn', 'titan'],
  },
  {
    id: 'cassini-link',
    name: 'Cassini Link',
    kind: 'regional',
    status: 'active',
    founded: 2209,
    headquarters: 'titan',
    focus: 'Saturnian relays',
    parent: 'ares',
    owner: null,
    worldIds: ['saturn', 'titan'],
  },
  {
    id: 'old',
    name: 'Old Merged Co',
    kind: 'regional',
    status: 'merged',
    founded: 2100,
    headquarters: 'saturn',
    focus: '',
    parent: null,
    owner: null,
    worldIds: [],
  },
] as unknown as Company[];
const NETWORK = {
  siteDate: '2380-06-09',
  stardate: '57436.2',
  nodes: [
    { id: 'c-saturn', kind: 'constellation', world: 'saturn', region: 'saturnian', fixedPosition: null },
    { id: 'h-saturnian', kind: 'hub', world: 'saturn', region: 'saturnian', fixedPosition: null },
  ],
  links: [
    {
      id: 'l1',
      layer: 'mesh',
      a: 'c-saturn',
      b: 'h-saturnian',
      operator: 'ares',
      established: 2200,
      processingMs: 0.5,
      hardened: false,
      capacityClass: 'regional',
      degraded: false,
    },
    {
      id: 'l2',
      layer: 'mesh',
      a: 'c-saturn',
      b: 'h-saturnian',
      operator: 'cassini-link',
      established: 2209,
      processingMs: 0.5,
      hardened: false,
      capacityClass: 'regional',
      degraded: false,
    },
  ],
  orbits: {},
} as unknown as Network;

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function Where() {
  const { hash } = useLocation();
  return <output data-testid="hash">{hash}</output>;
}

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <NetworkMap />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const lastProps = () =>
  view.mock.calls[view.mock.calls.length - 1][0] as {
    links: { id: string; emphasis: string }[];
    highlighted: Set<string>;
    dimOthers: boolean;
    fitNodes: string[] | null;
  };

beforeEach(() => {
  view.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      if (input.startsWith('/api/worlds/')) return Promise.resolve(json(WORLDS));
      if (input.startsWith('/api/companies/')) return Promise.resolve(json(COMPANIES));
      if (input.startsWith('/api/network/')) return Promise.resolve(json(NETWORK));
      if (input.startsWith('/api/regions/'))
        return Promise.resolve(json([{ id: 'saturnian', name: 'Saturnian', order: 5, worldIds: [] }]));
      return Promise.resolve(new Response('{}', { status: 404 }));
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('NetworkMap', () => {
  it('starts on the backbones when the URL has no filters, without changing the URL', async () => {
    renderAt('/about');
    await screen.findByTestId('map');
    await waitFor(() => expect(lastProps().links.map((l) => l.id)).toEqual(['l1']));
    expect(screen.getByTestId('hash')).toHaveTextContent('');
    expect(
      within(screen.getByRole('group', { name: 'Provider kind' })).getByRole('checkbox', { name: 'Backbone' }),
    ).toBeChecked();
  });

  it('keeps the default when the hash is another section of the page', async () => {
    renderAt('/about#history');
    await screen.findByTestId('map');
    await waitFor(() => expect(lastProps().links.map((l) => l.id)).toEqual(['l1']));
  });

  it('restores filters from a shared hash', async () => {
    renderAt('/about#network&layer=mesh&provider=cassini-link');
    await screen.findByTestId('map');
    expect(screen.getByRole('checkbox', { name: 'Regional mesh' })).toBeChecked();
    expect(screen.getByRole('region', { name: 'Cassini Link profile' })).toBeInTheDocument();
  });

  it('lights the chosen provider, dims the rest and frames its coverage', async () => {
    renderAt('/about#network');
    await screen.findByTestId('map');
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Providers' })).getByRole('checkbox', { name: 'Cassini Link' }),
    );
    await waitFor(() => expect(screen.getByTestId('hash')).toHaveTextContent('provider=cassini-link'));
    const props = lastProps();
    expect(props.links.find((l) => l.id === 'l2')?.emphasis).toBe('route');
    expect(props.links.find((l) => l.id === 'l1')?.emphasis).toBe('dim');
    expect(props.dimOthers).toBe(true);
    expect([...props.highlighted].sort()).toEqual(['saturn', 'titan']);
    expect(props.fitNodes?.sort()).toEqual(['c-saturn', 'c-titan']);
  });

  it('searches providers and leaves out merged companies', async () => {
    renderAt('/about#network');
    await screen.findByTestId('map');
    const list = screen.getByRole('group', { name: 'Providers' });
    expect(within(list).queryByText('Old Merged Co')).not.toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('Search providers'), 'cass');
    expect(within(list).getByText('Cassini Link')).toBeInTheDocument();
    expect(within(list).queryByText('Ares Interplanetary')).not.toBeInTheDocument();
  });

  it('lists every trading provider in a table as the text alternative', async () => {
    renderAt('/about#network');
    await screen.findByTestId('map');
    const table = screen.getByRole('table', { name: 'Providers trading in 2380', hidden: true });
    expect(within(table).getByText('Ares Interplanetary')).toBeInTheDocument();
    expect(within(table).queryByText('Old Merged Co')).not.toBeInTheDocument();
  });

  it('resets filters', async () => {
    renderAt('/about#network&layer=mesh');
    await screen.findByTestId('map');
    await userEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    await waitFor(() => expect(screen.getByTestId('hash')).toHaveTextContent(/^#network$/));
  });
});
