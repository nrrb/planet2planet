import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Company, Offer } from '../../api/types';
import { OfferCards } from './OfferCards';
import type { OfferItemProps } from './offerView';
import type { SortDir, SortKey } from './sorting';

vi.mock('./OfferDetails', () => ({ OfferDetails: () => <div>details body</div> }));

const offer = (id: string, patch: Record<string, unknown> = {}): Offer =>
  ({
    id,
    title: `Plan ${id}`,
    kind: 'standalone',
    badges: [],
    leadCompanyId: 'co',
    ownerId: null,
    partnerIds: [],
    serviceClass: 'shared',
    throughput: 10,
    resilienceTier: 'standard',
    conjunction: 'degraded',
    hops: 3,
    handoffs: 1,
    onNetworkShare: 0.5,
    environments: [],
    sectors: [],
    latencyMs: { now: 26.9, min: 8.7, max: 28 },
    price: { monthly: 1234, setup: 345 },
    ...patch,
  }) as unknown as Offer;

const companies = new Map([['co', { id: 'co', name: 'Jovian Subspace' } as Company]]);

function setup(over: Partial<OfferItemProps> = {}, sort: SortKey = 'price', dir: SortDir = 'asc') {
  const calls = { sort: vi.fn(), route: vi.fn(), request: vi.fn(), details: vi.fn(), compare: vi.fn() };
  const rowProps = (o: Offer): OfferItemProps => ({
    offer: o,
    companies,
    scale: { min: 0, max: 30 },
    from: 'earth',
    to: 'mars',
    compared: false,
    compareFull: false,
    detailsOpen: false,
    onToggleCompare: calls.compare,
    onToggleDetails: calls.details,
    onShowRoute: calls.route,
    onRequest: calls.request,
    ...over,
  });
  const offers = [
    offer('a', { badges: ['lowest-price'], kind: 'package' }),
    offer('b', { price: { monthly: 99, setup: 1 } }),
  ];
  render(<OfferCards offers={offers} sort={sort} dir={dir} onSort={calls.sort} rowProps={rowProps} />);
  return calls;
}

describe('OfferCards', () => {
  it('shows each plan as a card with its price, latency, provider and terms', () => {
    setup();
    const list = screen.getByRole('list', { name: 'Plans' });
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    const first = within(cards[0]);
    expect(first.getByRole('heading', { name: 'Plan a' })).toBeInTheDocument();
    expect(first.getByText('package')).toBeInTheDocument();
    expect(first.getByText('Lowest price')).toBeInTheDocument();
    expect(first.getByText('Jovian Subspace')).toBeInTheDocument();
    expect(first.getByText('1,234')).toBeInTheDocument();
    expect(first.getByText(/setup 345/i)).toBeInTheDocument();
    expect(first.getByText('26.9 ms now')).toBeInTheDocument();
    expect(first.getByRole('img', { name: /today, ranging/ })).toBeInTheDocument();
    expect(first.getByText('Shared')).toBeInTheDocument();
    expect(first.getByText('10 Gq/s')).toBeInTheDocument();
  });

  it('has a "Sort by" select listing every sortable column, set to the current sort', async () => {
    const { sort } = setup({}, 'price', 'asc');
    const select = screen.getByRole('combobox', { name: 'Sort by' });
    expect(select).toHaveValue('price');
    expect(within(select).getAllByRole('option').length).toBeGreaterThanOrEqual(14);
    await userEvent.selectOptions(select, 'latency');
    expect(sort).toHaveBeenCalledWith('latency');
  });

  it('has a button that flips the direction and says which way the list runs', async () => {
    const { sort } = setup({}, 'price', 'asc');
    const button = screen.getByRole('button', { name: /lowest first|ascending/i });
    await userEvent.click(button);
    expect(sort).toHaveBeenCalledWith('price');
  });

  it('names the direction in words', () => {
    setup({}, 'throughput', 'desc');
    expect(screen.getByRole('button', { name: /highest first|descending/i })).toBeInTheDocument();
  });

  it('puts Route, Details, Request and Compare on every card', async () => {
    const c = setup();
    const card = within(screen.getAllByRole('listitem')[0]);
    await userEvent.click(card.getByRole('button', { name: 'Route' }));
    await userEvent.click(card.getByRole('button', { name: 'Details' }));
    await userEvent.click(card.getByRole('button', { name: 'Request' }));
    await userEvent.click(card.getByRole('checkbox', { name: 'Compare Plan a' }));
    expect(c.route).toHaveBeenCalledOnce();
    expect(c.details).toHaveBeenCalledOnce();
    expect(c.request).toHaveBeenCalledOnce();
    expect(c.compare).toHaveBeenCalledOnce();
  });

  it('opens the details inside the card and marks the button expanded', () => {
    setup({ detailsOpen: true });
    const card = within(screen.getAllByRole('listitem')[0]);
    expect(card.getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-expanded', 'true');
    expect(card.getByText('details body')).toBeInTheDocument();
  });

  it('disables Compare when three are chosen and this plan is not one of them', () => {
    setup({ compareFull: true });
    expect(screen.getByRole('checkbox', { name: 'Compare Plan a' })).toBeDisabled();
  });
});
