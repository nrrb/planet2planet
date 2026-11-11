import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { type CompareState, parseCompareParams } from '../compare/params';
import { FilterDrawer } from './FilterDrawer';

const parse = (query: string) => parseCompareParams(new URLSearchParams(`from=jupiter&to=saturn&${query}`));

function setup(query = '') {
  let state = parse(query);
  const update = vi.fn((change: (s: CompareState) => CompareState) => {
    state = change(state);
  });
  render(<FilterDrawer state={state} update={update} providers={[]} companyName={(id) => id} />);
  return { update, current: () => state };
}

describe('FilterDrawer', () => {
  it('starts collapsed, below the world selection, and says nothing is applied', () => {
    setup();
    const toggle = screen.getByRole('button', { name: 'Filters' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('form', { name: 'Filter options' })).not.toBeInTheDocument();
    expect(screen.getByText('None applied')).toBeInTheDocument();
  });

  it('opens and closes', async () => {
    setup();
    const toggle = screen.getByRole('button', { name: 'Filters' });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('form', { name: 'Filter options' })).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.queryByRole('form', { name: 'Filter options' })).not.toBeInTheDocument();
  });

  it('keeps active filters visible as chips while collapsed, with a count', () => {
    setup('class=dedicated&maxLatencyMs=80');
    expect(screen.getByRole('button', { name: 'Filters (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove filter Class: Dedicated' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove filter Latency ≤ 80 ms' })).toBeInTheDocument();
    expect(screen.queryByText('None applied')).not.toBeInTheDocument();
  });

  it('removes one filter from its chip, and resets them all', async () => {
    const { current } = setup('class=shared,dedicated&reroute=true');
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter Class: Shared' }));
    expect(current().classes).toEqual(['dedicated']);
    await userEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(current().classes).toEqual([]);
    expect(current().reroute).toBe(false);
  });
});
