import { formatLatency, formatLatencyRange } from './format';
import styles from './LatencyBar.module.css';

interface Props {
  now: number;
  min: number;
  max: number;
  /** The shared scale, so bars can be compared across offers. */
  scaleMin: number;
  scaleMax: number;
}

export function barPositions({ now, min, max, scaleMin, scaleMax }: Props) {
  const span = Math.max(scaleMax - scaleMin, 1e-9);
  const pct = (value: number) => Math.min(100, Math.max(0, ((value - scaleMin) / span) * 100));
  const left = pct(min);
  const width = Math.max(pct(max) - left, 3);
  return { left, width: Math.min(width, 100 - left), now: pct(now) };
}

/** Yearly latency span on a shared scale, with a tick for today. */
export function LatencyBar(props: Props) {
  const { left, width, now } = barPositions(props);
  return (
    <div
      className={styles.bar}
      role="img"
      aria-label={`${formatLatency(props.now)} today, ranging ${formatLatencyRange(props.min, props.max)} over the year`}
    >
      <span className={styles.range} style={{ left: `${left}%`, width: `${width}%` }} />
      <span className={styles.now} style={{ left: `${now}%` }} />
    </div>
  );
}
