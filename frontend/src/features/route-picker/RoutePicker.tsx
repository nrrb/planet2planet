import { useId } from 'react';
import type { World } from '../../api/types';
import { groupWorlds } from './groupWorlds';
import styles from './RoutePicker.module.css';

interface SelectProps {
  label: string;
  value: string | null;
  worlds: World[];
  /** The world chosen at the other end; it cannot be chosen here. */
  taken: string | null;
  onChange: (id: string) => void;
}

function WorldSelect({ label, value, worlds, taken, onChange }: SelectProps) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <select id={id} className={styles.select} value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
        <option value="" disabled>
          Choose a world
        </option>
        {groupWorlds(worlds).map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.worlds.map((world) => (
              <option key={world.id} value={world.id} disabled={!world.eligible || world.id === taken}>
                {world.name}
                {world.eligible ? '' : ' (no network yet)'}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

interface Props {
  worlds: World[];
  from: string | null;
  to: string | null;
  onChange: (end: 'from' | 'to', world: string) => void;
}

export function RoutePicker({ worlds, from, to, onChange }: Props) {
  return (
    <div className={styles.picker}>
      <WorldSelect label="From" value={from} worlds={worlds} taken={to} onChange={(id) => onChange('from', id)} />
      <WorldSelect label="To" value={to} worlds={worlds} taken={from} onChange={(id) => onChange('to', id)} />
    </div>
  );
}
