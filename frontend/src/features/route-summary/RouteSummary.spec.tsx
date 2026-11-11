import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Region, RouteSummary as Route } from '../../api/types';
import { RouteSummary } from './RouteSummary';

const REGIONS: Region[] = [
  { id: 'jovian', name: 'Jovian', order: 4, worldIds: [] },
  { id: 'saturnian', name: 'Saturnian', order: 5, worldIds: [] },
];
const ROUTE: Route = {
  from: 'jupiter',
  to: 'saturn',
  date: '2380-06-09',
  stardate: '57436.2',
  distanceKm: 1_092_764_447,
  latencyMs: { direct: 70.1, min: 70.1, max: 85.18 },
  regions: ['jovian', 'saturnian'],
  providers: 7,
  independentCarriers: 5,
  conjunction: { activeNow: false, nextStart: '2380-07-15', nextEnd: '2380-08-19' },
};

describe('RouteSummary', () => {
  it('shows distance, latency and its yearly range', () => {
    render(<RouteSummary route={ROUTE} regions={REGIONS} />);
    expect(screen.getByText('1,092,764,447 km (7.30 AU)')).toBeInTheDocument();
    expect(screen.getByText('One-way latency today').nextElementSibling).toHaveTextContent(/^70\.1 ms/);
    expect(screen.getByText('Over the year: 70.1 ms to 85.2 ms')).toBeInTheDocument();
  });

  it('names the regions crossed and the competition', () => {
    render(<RouteSummary route={ROUTE} regions={REGIONS} />);
    expect(screen.getByText('Jovian, Saturnian')).toBeInTheDocument();
    expect(screen.getByText('5 independent carriers compete')).toBeInTheDocument();
  });

  it('gives the next conjunction window, or says there is none', () => {
    const { rerender } = render(<RouteSummary route={ROUTE} regions={REGIONS} />);
    expect(screen.getByText('15 Jul 2380 to 19 Aug 2380')).toBeInTheDocument();
    rerender(
      <RouteSummary
        route={{ ...ROUTE, conjunction: { activeNow: false, nextStart: null, nextEnd: null } }}
        regions={REGIONS}
      />,
    );
    expect(screen.getByText('None in the next four years')).toBeInTheDocument();
    rerender(
      <RouteSummary
        route={{ ...ROUTE, conjunction: { activeNow: true, nextStart: '2380-06-01', nextEnd: '2380-06-20' } }}
        regions={REGIONS}
      />,
    );
    expect(screen.getByText(/^Under way now/)).toBeInTheDocument();
  });
});
