import styles from './CanonLabel.module.css';

export type LabelKind = 'on-screen' | 'reference-book' | 'not-found' | 'invented' | 'real';

const LABELS: Record<LabelKind, { text: string; tone: string }> = {
  'on-screen': { text: 'On screen', tone: styles.screen },
  'reference-book': { text: 'Reference book', tone: styles.book },
  'not-found': { text: 'Not found on screen', tone: styles.book },
  invented: { text: 'Invented', tone: styles.invented },
  real: { text: 'Real astronomy', tone: styles.real },
};

export const labelText = (kind: LabelKind): string => LABELS[kind].text;

/**
 * Says where a claim comes from: on screen (canon), a reference book (known but not used),
 * invented (Planet2Planet's own) or real astronomy. The words are always shown; colour only
 * reinforces them.
 */
export function CanonLabel({ kind }: { kind: LabelKind }) {
  const { text, tone } = LABELS[kind];
  return (
    <span className={`${styles.label} ${tone}`}>
      <span className={styles.dot} aria-hidden="true" />
      {text}
    </span>
  );
}
