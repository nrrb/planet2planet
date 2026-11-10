import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Company, HistoryEvent, World } from '../../api/types';
import { Timeline } from './Timeline';

const WORLDS = [
  { id: 'earth', name: 'Earth', region: 'earth-luna', type: 'planet', parent: null, eligible: true, radiusKm: 1 },
  { id: 'mars', name: 'Mars', region: 'mars', type: 'planet', parent: null, eligible: true, radiusKm: 1 },
] as World[];
const COMPANIES = [{ id: 'terran', name: 'Terran Transit', kind: 'backbone' }] as unknown as Company[];
const ev = (year: number, type: string, world: string, extra: Record<string, unknown> = {}) =>
  ({ year, type, world, company: null, buyer: null, detail: null, ...extra }) as unknown as HistoryEvent;
// Five events in 2198 so that the year collapses.
const crowded = ['company-founded', 'company-founded', 'colonized', 'company-founded', 'colonized'].map((type, i) =>
  ev(2198, type, 'mars', type === 'company-founded' ? { company: 'terran', detail: `Brand ${i}` } : {}),
);
const EVENTS: HistoryEvent[] = [
  ev(1962, 'conventional-constellation', 'earth'),
  ev(2151, 'constellation-converted', 'earth'),
  ...crowded,
];
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function renderTimeline() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Timeline />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) =>
      Promise.resolve(
        input.startsWith('/api/history/')
          ? json(EVENTS)
          : input.startsWith('/api/worlds/')
            ? json(WORLDS)
            : json(COMPANIES),
      ),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('Timeline', () => {
  it('shows eras with their events as text, each with its kind in words', async () => {
    renderTimeline();
    expect(await screen.findByRole('heading', { name: 'Before subspace' })).toBeInTheDocument();
    expect(screen.getByText('Earth: first relay constellation, at light speed')).toBeInTheDocument();
    expect(screen.getByText('Earth: network converted to subspace')).toBeInTheDocument();
    // The glyph is decoration; the kind is always written out.
    expect(screen.getAllByText('Converted to subspace').length).toBeGreaterThan(0);
    expect(screen.getByText('First warp flight')).toBeInTheDocument();
    expect(screen.getByText('Subspace relays arrive')).toBeInTheDocument();
  });

  it('collapses a crowded year and expands it on request', async () => {
    renderTimeline();
    await screen.findByRole('heading', { name: 'Early subspace' });
    const more = screen.getByRole('button', { name: '+2 events' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Brand 3')).not.toBeInTheDocument();
    await userEvent.click(more);
    expect(screen.getByText('Brand 3')).toBeInTheDocument();
    expect(screen.getAllByText('Mars colonized')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Show fewer' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('filters by kind of event and says how many are shown', async () => {
    renderTimeline();
    await screen.findByRole('heading', { name: 'Early subspace' });
    expect(screen.getByRole('status')).toHaveTextContent('7 of 7 events');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Companies' }));
    expect(screen.getByRole('status')).toHaveTextContent('4 of 7 events');
    expect(screen.queryByText('Terran Transit founded')).not.toBeInTheDocument();
  });

  it('can show key milestones only', async () => {
    renderTimeline();
    await screen.findByRole('heading', { name: 'Early subspace' });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Key milestones only' }));
    const shown = screen.getByRole('status');
    expect(shown).toHaveTextContent(/^[0-9]+ of 7 events/);
    expect(within(shown).queryByText('7 of 7 events')).not.toBeInTheDocument();
    expect(screen.getByText('Earth: network converted to subspace')).toBeInTheDocument();
  });

  it('says when nothing matches', async () => {
    renderTimeline();
    await screen.findByRole('heading', { name: 'Early subspace' });
    for (const name of ['Worlds reached', 'Constellations', 'Change to subspace', 'Companies']) {
      await userEvent.click(screen.getByRole('checkbox', { name }));
    }
    expect(screen.getByText(/Nothing matches these filters/)).toBeInTheDocument();
  });
});
