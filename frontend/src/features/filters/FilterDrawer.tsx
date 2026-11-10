import { useId, useState } from 'react';
import type { Company } from '../../api/types';
import { activeFilterCount, type CompareState, withoutFilters } from '../compare/params';
import { activeFilters } from './activeFilters';
import { Filters } from './Filters';
import styles from './FilterDrawer.module.css';

interface Props {
  state: CompareState;
  update: (change: (state: CompareState) => CompareState) => void;
  providers: Company[];
  companyName: (id: string) => string;
}

/** Filters in a drawer that starts closed. Active filters stay visible as removable chips. */
export function FilterDrawer({ state, update, providers, companyName }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const count = activeFilterCount(state);
  const chips = activeFilters(state, companyName);
  return (
    <section className={styles.drawer} aria-label="Filters">
      <div className={styles.bar}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={styles.caret} aria-hidden="true">
            {open ? '▼' : '▶'}
          </span>
          Filters{count ? ` (${count})` : ''}
        </button>
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={styles.chip}
            onClick={() => update(chip.remove)}
            aria-label={`Remove filter ${chip.label}`}
          >
            {chip.label} <span aria-hidden="true">×</span>
          </button>
        ))}
        {count > 0 && (
          <button type="button" className={styles.reset} onClick={() => update(withoutFilters)}>
            Reset filters
          </button>
        )}
        {count === 0 && !open && <span className={styles.none}>None applied</span>}
      </div>
      {open && (
        <div id={panelId} className={styles.panel}>
          <Filters state={state} update={update} providers={providers} />
        </div>
      )}
    </section>
  );
}
