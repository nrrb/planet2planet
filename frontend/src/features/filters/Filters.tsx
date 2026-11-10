import { useId } from 'react';
import type { Company } from '../../api/types';
import {
  ENVIRONMENT_LABELS,
  KIND_LABELS,
  SECTOR_LABELS,
  SERVICE_CLASS_HINTS,
  SERVICE_CLASS_LABELS,
  TIER_LABELS,
} from '../../content/labels';
import { activeFilterCount, type CompareState, withoutFilters } from '../compare/params';
import styles from './Filters.module.css';

type Update = (change: (state: CompareState) => CompareState) => void;

const toggle = (list: string[], value: string): string[] =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

interface GroupProps {
  legend: string;
  options: [string, string, string?][];
  selected: string[];
  onToggle: (value: string) => void;
}

function CheckGroup({ legend, options, selected, onToggle }: GroupProps) {
  return (
    <fieldset className={styles.group}>
      <legend>{legend}</legend>
      {options.map(([value, label, hint]) => (
        <label key={value} className={styles.option}>
          <input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} />
          <span>
            {label}
            {hint && <span className={styles.hint}> ({hint})</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

interface Props {
  state: CompareState;
  update: Update;
  /** Companies that can appear on offers for this pair. */
  providers: Company[];
}

export function Filters({ state, update, providers }: Props) {
  const latencyId = useId();
  const entries = (labels: Record<string, string>): [string, string][] => Object.entries(labels);
  const count = activeFilterCount(state);
  return (
    <form className={styles.form} onSubmit={(event) => event.preventDefault()} aria-label="Filters">
      <CheckGroup
        legend="Service class"
        options={Object.entries(SERVICE_CLASS_LABELS).map(([value, label]) => [
          value,
          label,
          SERVICE_CLASS_HINTS[value as keyof typeof SERVICE_CLASS_HINTS],
        ])}
        selected={state.classes}
        onToggle={(value) => update((s) => ({ ...s, classes: toggle(s.classes, value) }))}
      />
      <div>
        <label htmlFor={latencyId} style={{ fontWeight: 650, display: 'block', marginBottom: 4 }}>
          Latest acceptable latency (ms)
        </label>
        <input
          id={latencyId}
          className={styles.number}
          type="number"
          min={1}
          inputMode="decimal"
          value={state.maxLatencyMs ?? ''}
          onChange={(event) => {
            const value = Number(event.target.value);
            update((s) => ({ ...s, maxLatencyMs: event.target.value && value > 0 ? value : null }));
          }}
        />
      </div>
      <CheckGroup
        legend="Sector"
        options={entries(SECTOR_LABELS)}
        selected={state.sectors}
        onToggle={(value) => update((s) => ({ ...s, sectors: toggle(s.sectors, value) }))}
      />
      <CheckGroup
        legend="Redundancy tier"
        options={entries(TIER_LABELS)}
        selected={state.tiers}
        onToggle={(value) => update((s) => ({ ...s, tiers: toggle(s.tiers, value) }))}
      />
      <CheckGroup
        legend="Provider kind"
        options={entries(KIND_LABELS)}
        selected={state.kinds}
        onToggle={(value) => update((s) => ({ ...s, kinds: toggle(s.kinds, value) }))}
      />
      <details className={styles.providers} open={state.companies.length > 0}>
        <summary>Specific providers{state.companies.length ? ` (${state.companies.length})` : ''}</summary>
        <CheckGroup
          legend="Providers on this route"
          options={providers.map((company) => [company.id, company.name])}
          selected={state.companies}
          onToggle={(value) => update((s) => ({ ...s, companies: toggle(s.companies, value) }))}
        />
      </details>
      <CheckGroup
        legend="Hardened for"
        options={entries(ENVIRONMENT_LABELS)}
        selected={state.envs}
        onToggle={(value) => update((s) => ({ ...s, envs: toggle(s.envs, value) }))}
      />
      <label className={styles.option}>
        <input
          type="checkbox"
          checked={state.reroute}
          onChange={() => update((s) => ({ ...s, reroute: !s.reroute }))}
        />
        <span>Reroutes through solar conjunction</span>
      </label>
      <button type="button" className={styles.reset} disabled={count === 0} onClick={() => update(withoutFilters)}>
        Reset filters
      </button>
    </form>
  );
}
