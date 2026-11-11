import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Company } from '../../api/types';
import { type CompareState, parseCompareParams } from '../compare/params';
import { Filters } from './Filters';

const base = () => parseCompareParams(new URLSearchParams('from=jupiter&to=saturn'));
const PROVIDERS = [{ id: 'cassini-link', name: 'Cassini Link' }] as Company[];

function setup(initial: CompareState = base()) {
  let state = initial;
  const update = vi.fn((change: (s: CompareState) => CompareState) => {
    state = change(state);
  });
  render(<Filters state={initial} update={update} providers={PROVIDERS} />);
  return { update, current: () => state };
}

describe('Filters', () => {
  it('toggles a service class', async () => {
    const { current } = setup();
    await userEvent.click(screen.getByRole('checkbox', { name: /Dedicated/ }));
    expect(current().classes).toEqual(['dedicated']);
  });

  it('sets and clears the maximum latency', () => {
    const { current } = setup();
    const input = screen.getByLabelText('Latest acceptable latency (ms)');
    fireEvent.change(input, { target: { value: '80' } });
    expect(current().maxLatencyMs).toBe(80);
  });

  it('clears the maximum latency when the field is emptied', () => {
    const { current } = setup(parseCompareParams(new URLSearchParams('from=a&to=b&maxLatencyMs=80')));
    fireEvent.change(screen.getByLabelText('Latest acceptable latency (ms)'), { target: { value: '' } });
    expect(current().maxLatencyMs).toBeNull();
  });

  it('offers providers on the route', async () => {
    const { current } = setup();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Cassini Link' }));
    expect(current().companies).toEqual(['cassini-link']);
  });

  it('shows the checked state from the URL', () => {
    setup(parseCompareParams(new URLSearchParams('from=a&to=b&tier=contingency&reroute=true')));
    expect(screen.getByRole('checkbox', { name: 'Contingency' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Reroutes through solar conjunction' })).toBeChecked();
  });
});
