import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { World } from '../../api/types';
import { RoutePicker } from './RoutePicker';

const world = (id: string, name: string, parent: string | null = null, eligible = true): World => ({
  id,
  name,
  type: parent ? 'moon' : 'planet',
  parent,
  region: 'x',
  eligible,
  radiusKm: 1000,
});
const WORLDS = [
  world('earth', 'Earth'),
  world('jupiter', 'Jupiter'),
  world('io', 'Io', 'jupiter'),
  world('vulcan', 'Vulcan', null, false),
];

function option(select: HTMLElement, name: RegExp) {
  return within(select).getByRole('option', { name });
}

describe('RoutePicker', () => {
  it('disables the world chosen at the other end, both ways', () => {
    render(<RoutePicker worlds={WORLDS} from="earth" to="jupiter" onChange={vi.fn()} />);
    const from = screen.getByLabelText('From');
    const to = screen.getByLabelText('To');
    expect(option(from, /^Jupiter$/)).toBeDisabled();
    expect(option(from, /^Earth$/)).toBeEnabled();
    expect(option(to, /^Earth$/)).toBeDisabled();
    expect(option(to, /^Jupiter$/)).toBeEnabled();
  });

  it('disables worlds with no network yet', () => {
    render(<RoutePicker worlds={WORLDS} from={null} to={null} onChange={vi.fn()} />);
    expect(option(screen.getByLabelText('From'), /Vulcan \(no network yet\)/)).toBeDisabled();
  });

  it('groups moons under their planet', () => {
    render(<RoutePicker worlds={WORLDS} from={null} to={null} onChange={vi.fn()} />);
    expect(within(screen.getByLabelText('From')).getByRole('group', { name: 'Moons of Jupiter' })).toBeInTheDocument();
  });

  it('reports a change', async () => {
    const onChange = vi.fn();
    render(<RoutePicker worlds={WORLDS} from="earth" to="jupiter" onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText('To'), 'io');
    expect(onChange).toHaveBeenCalledWith('to', 'io');
    expect(screen.queryByRole('button', { name: /swap/i })).not.toBeInTheDocument();
  });
});
