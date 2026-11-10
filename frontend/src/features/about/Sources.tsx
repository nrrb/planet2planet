import { Link } from 'react-router-dom';
import { useMeta } from '../../api/hooks';
import { SOURCES_INTRO } from '../../content/about';
import styles from '../../ui/Section.module.css';

export function Sources() {
  const meta = useMeta();
  return (
    <>
      <p className={styles.prose}>{SOURCES_INTRO}</p>
      <p className={styles.prose}>
        Want to know which parts of this setting are on-screen Star Trek and which were invented?{' '}
        <Link to="/canon">Read how it was built</Link>.
      </p>
      {meta.data && (
        <ul className={styles.list} aria-label="Sources">
          {meta.data.sources.map((source) => (
            <li key={source.id}>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.title}
              </a>{' '}
              <span className={styles.note}>(opens in a new tab)</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
