import type { Region, RouteSummary as Route } from '../../api/types';
import { formatDate, formatDistance, formatLatency, formatLatencyRange } from '../../ui/format';
import styles from './RouteSummary.module.css';

function conjunctionText(conjunction: Route['conjunction']): string {
  if (!conjunction.nextStart || !conjunction.nextEnd) return 'None in the next four years';
  const span = `${formatDate(conjunction.nextStart)} to ${formatDate(conjunction.nextEnd)}`;
  return conjunction.activeNow ? `Under way now: ${span}` : span;
}

export function RouteSummary({ route, regions }: { route: Route; regions: Region[] }) {
  const names = route.regions.map((id) => regions.find((r) => r.id === id)?.name ?? id);
  return (
    <dl className={styles.readout} aria-label="Route summary">
      <div className={styles.cell}>
        <dt>Distance today</dt>
        <dd className="figure">{formatDistance(route.distanceKm)}</dd>
      </div>
      <div className={styles.cell}>
        <dt>One-way latency today</dt>
        <dd>
          <span className="figure">{formatLatency(route.latencyMs.direct)}</span>
          <small>Over the year: {formatLatencyRange(route.latencyMs.min, route.latencyMs.max)}</small>
        </dd>
      </div>
      <div className={styles.cell}>
        <dt>Providers</dt>
        <dd>
          <span className="figure">{route.providers}</span>
          <small>{route.independentCarriers} independent carriers compete</small>
        </dd>
      </div>
      <div className={styles.cell}>
        <dt>Regions crossed</dt>
        <dd>{names.join(', ')}</dd>
      </div>
      <div className={styles.cell}>
        <dt>Next solar conjunction</dt>
        <dd>{conjunctionText(route.conjunction)}</dd>
      </div>
    </dl>
  );
}
