import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Offer } from '../../api/types';
import { Results } from './Results';

const offer = {
  id: 'a',
  title: 'Plan a',
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
  onNetworkShare: 1,
  environments: [],
  sectors: [],
  latencyMs: { now: 20, min: 10, max: 30 },
  price: { monthly: 100, setup: 10 },
} as unknown as Offer;

function renderResults() {
  render(
    <Results
      offers={[offer]}
      loading={false}
      error={null}
      onRetry={vi.fn()}
      fromName="Earth"
      toName="Mars"
      sort="price"
      dir="asc"
      onSort={vi.fn()}
      filtered={false}
      onResetFilters={vi.fn()}
      companies={new Map()}
      from="earth"
      to="mars"
      compare={[]}
      maxCompare={3}
      openOffer={null}
      onToggleCompare={vi.fn()}
      onToggleDetails={vi.fn()}
      onShowRoute={vi.fn()}
      onRequest={vi.fn()}
    />,
  );
}

function narrow(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: matches && query.includes('max-width: 767px'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Results layout', () => {
  it('is a table on a wide screen', () => {
    narrow(false);
    renderResults();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Sort by' })).not.toBeInTheDocument();
  });

  it('is a list of cards with a sort select on a narrow screen', () => {
    narrow(true);
    renderResults();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Plans' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toBeInTheDocument();
  });
});
