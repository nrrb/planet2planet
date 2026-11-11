import { type ReactNode, useId, useState } from 'react';
import styles from './Charts.module.css';

interface Props {
  title: string;
  summary: string;
  chart: ReactNode;
  table: ReactNode;
  /** Shown above the chart, e.g. a world picker or a legend. */
  controls?: ReactNode;
}

/** A chart with a "Show as table" toggle, so no figure depends on seeing the picture. */
export function ChartFrame({ title, summary, chart, table, controls }: Props) {
  const [asTable, setAsTable] = useState(false);
  const bodyId = useId();
  return (
    <div className={styles.frame}>
      <div className={styles.head}>
        <h3>{title}</h3>
        <button
          type="button"
          className={styles.toggle}
          aria-pressed={asTable}
          aria-controls={bodyId}
          onClick={() => setAsTable((v) => !v)}
        >
          {asTable ? 'Show as chart' : 'Show as table'}
        </button>
      </div>
      <p className={styles.summary}>{summary}</p>
      {controls}
      <div id={bodyId}>
        {asTable ? (
          <div className={styles.tableWrap} role="group" aria-label={`${title}, table`} tabIndex={0}>
            {table}
          </div>
        ) : (
          <div className={styles.chart} role="group" aria-label={`${title}, chart`} tabIndex={0}>
            {chart}
          </div>
        )}
      </div>
    </div>
  );
}
