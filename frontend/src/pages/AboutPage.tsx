import { useCompanies, useWorlds } from '../api/hooks';
import { HISTORY_INTRO, NETWORK_INTRO, OVERVIEW } from '../content/about';
import { Sources } from '../features/about/Sources';
import { Subspace } from '../features/about/Subspace';
import { Tiers } from '../features/about/Tiers';
import styles from '../features/about/Section.module.css';
import { NetworkMap } from '../features/network-map/NetworkMap';
import { Timeline } from '../features/timeline/Timeline';

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'history', label: 'History of the networks' },
  { id: 'network', label: 'The network today' },
  { id: 'subspace', label: 'How subspace works' },
  { id: 'bad-days', label: 'Built for bad days' },
  { id: 'sources', label: 'Sources and disclaimer' },
];

export default function AboutPage() {
  const worlds = useWorlds().data;
  const companies = useCompanies().data;
  const brands = companies?.filter((c) => c.status !== 'merged' && c.worldIds.length > 0).length;
  const problem = OVERVIEW.problem(worlds?.length ?? 33, brands ?? 46);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 20 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        <h1>About Planet2Planet</h1>
        <nav aria-label="On this page">
          <ul className={styles.toc}>
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <section id="overview" className={styles.section} aria-labelledby="overview-h">
        <h2 id="overview-h">{problem.heading}</h2>
        <div className={styles.prose}>
          {problem.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        <h3 className={styles.sub}>{OVERVIEW.solution.heading}</h3>
        <div className={styles.prose}>
          {OVERVIEW.solution.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </section>

      <section id="history" className={styles.section} aria-labelledby="history-h">
        <h2 id="history-h">A short history of Sol&rsquo;s networks</h2>
        <p className={styles.prose}>{HISTORY_INTRO}</p>
        <Timeline />
      </section>

      <section id="network" className={styles.section} aria-labelledby="network-h">
        <h2 id="network-h">The network today</h2>
        <p className={styles.prose}>{NETWORK_INTRO}</p>
        <NetworkMap />
      </section>

      <section id="subspace" className={styles.section} aria-labelledby="subspace-h">
        <h2 id="subspace-h">How subspace works</h2>
        <Subspace />
      </section>

      <section id="bad-days" className={styles.section} aria-labelledby="bad-days-h">
        <h2 id="bad-days-h">Built for bad days</h2>
        <Tiers />
      </section>

      <section id="sources" className={styles.section} aria-labelledby="sources-h">
        <h2 id="sources-h">Sources and fan disclaimer</h2>
        <Sources />
      </section>
    </div>
  );
}
