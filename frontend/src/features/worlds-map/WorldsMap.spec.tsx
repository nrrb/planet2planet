import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Network, World } from '../../api/types';
import { WorldsMap } from './WorldsMap';

const view = vi.fn();
vi.mock('../../map/MapView', () => ({
  default: (props: unknown) => {
    view(props);
    return <div data-testid="map" />;
  },
}));

const WORLDS = [
  { id: 'jupiter', name: 'Jupiter', type: 'planet', parent: null, region: 'jovian', eligible: true, radiusKm: 69911 },
  { id: 'saturn', name: 'Saturn', type: 'planet', parent: null, region: 'saturnian', eligible: true, radiusKm: 58232 },
] as World[];
const NETWORK = { siteDate: '2380-06-09', stardate: '57436.2', nodes: [], links: [], orbits: {} } as unknown as Network;
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function renderMap(from: string | null, to: string | null) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <WorldsMap from={from} to={to} />
    </QueryClientProvider>,
  );
}
const lastProps = () =>
  view.mock.calls[view.mock.calls.length - 1][0] as {
    links: unknown[];
    highlighted: Set<string>;
    markers: Map<string, string>;
    showAllMoons: boolean;
    label: string;
  };

beforeEach(() => {
  view.mockClear();
  window.localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) =>
      Promise.resolve(
        input.startsWith('/api/worlds/') ? json(WORLDS) : input.startsWith('/api/network/') ? json(NETWORK) : json({}),
      ),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('WorldsMap', () => {
  it('highlights the chosen worlds and draws no route', async () => {
    renderMap('jupiter', 'saturn');
    await screen.findByTestId('map');
    const props = lastProps();
    expect(props.links).toEqual([]);
    expect([...props.highlighted].sort()).toEqual(['jupiter', 'saturn']);
    expect(props.markers.get('jupiter')).toBe('from');
    expect(props.markers.get('saturn')).toBe('to');
    expect(props.showAllMoons).toBe(true);
  });

  it('describes the choice in words for assistive technology', async () => {
    renderMap('jupiter', 'saturn');
    await screen.findByTestId('map');
    expect(lastProps().label).toBe('Map of the Sol system, with Jupiter as the origin and Saturn as the destination');
  });

  it('highlights only what is chosen', async () => {
    renderMap('jupiter', null);
    await screen.findByTestId('map');
    expect([...lastProps().highlighted]).toEqual(['jupiter']);
  });

  it('can be hidden, and remembers that', async () => {
    const { unmount } = renderMap('jupiter', 'saturn');
    await screen.findByTestId('map');
    await userEvent.click(screen.getByRole('button', { name: 'Hide map' }));
    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show map' })).toHaveAttribute('aria-expanded', 'false');
    unmount();
    renderMap('jupiter', 'saturn');
    expect(screen.getByRole('button', { name: 'Show map' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('map')).not.toBeInTheDocument());
  });
});
