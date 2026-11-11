import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoryMap } from './HistoryMap';

const view = vi.fn();
vi.mock('../../map/MapView', () => ({
  default: (props: unknown) => {
    view(props);
    return <div data-testid="map" />;
  },
}));

const world = (id: string, name: string) => ({
  id,
  name,
  region: 'x',
  type: 'planet',
  parent: null,
  eligible: true,
  radiusKm: 1,
});
const WORLDS = [world('earth', 'Earth'), world('mars', 'Mars'), world('io', 'Io')];
const COMPANIES = [
  { id: 'terran', name: 'Terran Transit', founded: 1962, status: 'active', acquiredYear: null },
  { id: 'old', name: 'Old Co', founded: 2100, status: 'merged', acquiredYear: 2200 },
];
const ev = (year: number, type: string, w: string, extra: Record<string, unknown> = {}) => ({
  year,
  type,
  world: w,
  company: null,
  buyer: null,
  detail: null,
  ...extra,
});
const EVENTS = [
  ev(1962, 'conventional-constellation', 'earth'),
  ev(2069, 'colonized', 'mars'),
  ev(2151, 'constellation-converted', 'earth'),
  ev(2160, 'subspace-constellation', 'io'),
];
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function renderMap() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <HistoryMap />
    </QueryClientProvider>,
  );
}
const lastMarks = () =>
  (
    view.mock.calls[view.mock.calls.length - 1][0] as {
      marks: Map<string, { constellation: string; colonized: boolean }>;
    }
  ).marks;
const slider = () => screen.getByRole('slider', { name: 'Year' });

beforeEach(() => {
  view.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) =>
      Promise.resolve(
        input.startsWith('/api/history/')
          ? json(EVENTS)
          : input.startsWith('/api/worlds/')
            ? json(WORLDS)
            : input.startsWith('/api/network/')
              ? json({ nodes: [], links: [], orbits: {} })
              : json(COMPANIES),
      ),
    ),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('HistoryMap', () => {
  it('starts at the first relay satellite and shows nothing played', async () => {
    renderMap();
    await screen.findByTestId('map');
    expect(slider()).toHaveValue('1962');
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(lastMarks().get('earth')).toEqual({ constellation: 'conventional', colonized: false });
  });

  it('never plays on its own', async () => {
    renderMap();
    await screen.findByTestId('map');
    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(slider()).toHaveValue('1962');
  });

  it('drives the counts, the news line and the marks from the slider', async () => {
    renderMap();
    await screen.findByTestId('map');
    fireEvent.change(slider(), { target: { value: '2160' } });
    const counts = screen.getByLabelText('Counts in 2160');
    expect(within(counts).getByText('Worlds colonized').nextElementSibling).toHaveTextContent('1');
    expect(within(counts).getByText('Subspace constellations').nextElementSibling).toHaveTextContent('2');
    expect(within(counts).getByText('Telecom brands trading').nextElementSibling).toHaveTextContent('2');
    const news = screen.getByRole('list', { name: 'Latest events' });
    expect(within(news).getByText('Io: subspace constellation')).toBeInTheDocument();
    expect(lastMarks().get('io')).toEqual({ constellation: 'subspace', colonized: false });
    expect(lastMarks().get('mars')).toEqual({ constellation: 'none', colonized: true });
  });

  it('plays forward, pauses, and stops at the last year', async () => {
    renderMap();
    await screen.findByTestId('map');
    vi.useFakeTimers();
    const tick = async (ms: number) => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    };
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await tick(1000);
    expect(Number(slider().getAttribute('value') ?? (slider() as HTMLInputElement).value)).toBeGreaterThan(1962);

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    const paused = (slider() as HTMLInputElement).value;
    await tick(3000);
    expect((slider() as HTMLInputElement).value).toBe(paused);

    fireEvent.change(slider(), { target: { value: '2379' } });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await tick(2000);
    expect((slider() as HTMLInputElement).value).toBe('2380');
    expect(screen.getByRole('button', { name: 'Play again' })).toBeInTheDocument();
  });

  it('has a table view of what each world has in the chosen year', async () => {
    renderMap();
    await screen.findByTestId('map');
    fireEvent.change(slider(), { target: { value: '2160' } });
    await userEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    const table = screen.getByRole('table', { name: 'What each world has in 2160' });
    expect(within(table).getByRole('rowheader', { name: 'Earth' }).closest('tr')).toHaveTextContent('Subspace');
    expect(within(table).getByRole('rowheader', { name: 'Mars' }).closest('tr')).toHaveTextContent('Founded');
    expect(within(table).getByRole('rowheader', { name: 'Io' }).closest('tr')).toHaveTextContent('Subspace');
  });

  it('explains the ring styles in words', async () => {
    renderMap();
    await screen.findByTestId('map');
    const key = screen.getByRole('list', { name: 'Map key' });
    for (const text of ['Dashed ring', 'Solid ring', 'Filled world', 'Faint world'])
      expect(within(key).getByText(text)).toBeInTheDocument();
  });
});
