import { BADGE_LABELS } from '../content/labels';
import styles from './Badge.module.css';

/** A "best in category" marker. The label is always text; colour only reinforces it. */
export function Badge({ kind }: { kind: string }) {
  const tone = styles[kind] ?? '';
  return (
    <span className={`${styles.badge} ${tone}`}>
      <span className={styles.dot} aria-hidden="true" />
      {BADGE_LABELS[kind] ?? kind}
    </span>
  );
}
