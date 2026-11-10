import { useMeta, useSimulation } from '../api/hooks';
import { CANON_FIXES, INTRO, INVENTED, MONTE_CARLO, SIMULATION, SOURCES, WORLDS } from '../content/canon';
import { CanonLabel } from '../features/canon/CanonLabel';
import { Deadlines, SetAside, StartingConditions } from '../features/canon/FactTables';
import { ScriptLink } from '../features/canon/ScriptLink';
import { repoLink } from '../config';
import styles from '../ui/Section.module.css';

const SECTIONS = [
  { id: 'built-on-canon', label: 'Built on canon' },
  { id: 'worlds', label: 'The worlds' },
  { id: 'canon-fixes', label: 'What canon fixes' },
  { id: 'simulation', label: 'How the simulation works' },
  { id: 'monte-carlo', label: 'Monte Carlo' },
  { id: 'invented', label: 'What is invented' },
  { id: 'sources', label: 'Sources and downloads' },
];

function External({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children} <span className={styles.note}>(opens in a new tab)</span>
    </a>
  );
}

function Claims({ items }: { items: { kind: Parameters<typeof CanonLabel>[0]['kind']; text: string }[] }) {
  return (
    <ul className={styles.list}>
      {items.map((claim) => (
        <li key={claim.text}>
          <CanonLabel kind={claim.kind} /> {claim.text}
        </li>
      ))}
    </ul>
  );
}

export default function CanonPage() {
  const simulation = useSimulation().data;
  const meta = useMeta().data;
  const run = simulation?.run;
  const lastSeed = run ? run.firstSeed + run.runCount - 1 : null;
  const commit = run?.scriptCommit;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 20 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        <h1>Canon: how this world was built</h1>
        <p className={styles.prose}>
          This page is written out of universe. It separates what is on screen in Star Trek from what was invented, and
          explains the simulation. Every claim carries a label: <CanonLabel kind="on-screen" />{' '}
          <CanonLabel kind="reference-book" /> <CanonLabel kind="invented" /> <CanonLabel kind="real" />
        </p>
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

      <section id="built-on-canon" className={styles.section} aria-labelledby="built-h">
        <h2 id="built-h">Built on canon, filled in by simulation</h2>
        <p className={styles.prose}>{INTRO.lead}</p>
        <Claims items={INTRO.parts} />
        <p className={styles.prose}>{INTRO.snapshot}</p>
        <Claims items={INTRO.snapshotReasons} />
      </section>

      <section id="worlds" className={styles.section} aria-labelledby="worlds-h">
        <h2 id="worlds-h">The worlds</h2>
        <div className={styles.prose}>
          <p>
            <CanonLabel kind="real" /> {WORLDS.paragraphs[0]}
          </p>
        </div>
        <ol className={styles.list}>
          {WORLDS.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
        <p className={styles.prose}>{WORLDS.which}</p>
        <p className={styles.prose}>{WORLDS.sources}</p>
        <ul className={styles.list}>
          {WORLDS.links.map((link) => (
            <li key={link.url}>
              <External href={link.url}>{link.label}</External>
            </li>
          ))}
        </ul>
      </section>

      <section id="canon-fixes" className={styles.section} aria-labelledby="fixes-h">
        <h2 id="fixes-h">What canon fixes</h2>
        <p className={styles.prose}>{CANON_FIXES.intro}</p>
        <h3 className={styles.sub}>Starting conditions</h3>
        <p className={styles.prose}>{CANON_FIXES.starting}</p>
        <StartingConditions />
        <h3 className={styles.sub}>Deadlines</h3>
        <p className={styles.prose}>{CANON_FIXES.deadlines}</p>
        <Deadlines />
        <h3 className={styles.sub}>Set aside</h3>
        <p className={styles.prose}>{CANON_FIXES.setAside}</p>
        <SetAside />
      </section>

      <section id="simulation" className={styles.section} aria-labelledby="simulation-h">
        <h2 id="simulation-h">How the simulation works</h2>
        <p className={styles.prose}>
          <CanonLabel kind="invented" /> {SIMULATION.intro}
        </p>
        <h3 className={styles.sub}>The agents</h3>
        <dl className={styles.prose}>
          {SIMULATION.agents.map(([name, text]) => (
            <div key={name}>
              <dt style={{ fontWeight: 650 }}>{name}</dt>
              <dd style={{ margin: '0 0 6px' }}>{text}</dd>
            </div>
          ))}
        </dl>
        <h3 className={styles.sub}>Each year, in order</h3>
        <ol className={styles.list}>
          {SIMULATION.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <h3 className={styles.sub}>How targets are chosen</h3>
        <p className={styles.prose}>
          Each world gets a value and a difficulty, and the shipyard picks targets that are worth it and reachable.
        </p>
        <ul className={styles.list}>
          {SIMULATION.targets.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className={styles.prose}>{SIMULATION.targetsNote}</p>
        <h3 className={styles.sub}>The two rules that always hold</h3>
        <ul className={styles.list}>
          {SIMULATION.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className={styles.prose}>{SIMULATION.rulesNote}</p>
        <h3 className={styles.sub}>Read it and run it yourself</h3>
        <p className={styles.prose}>
          {commit ? <ScriptLink commit={commit} /> : <span>The simulation script is tools/colonization-sim.js.</span>}
        </p>
        <pre className={styles.code} aria-label="Command to run the simulation">
          <code>{SIMULATION.runIt}</code>
        </pre>
        <p className={styles.prose}>
          The derivation document explains every part of the dataset in detail:{' '}
          {repoLink('docs/sol-telecom-2380-derivation.md', commit) ? (
            <External href={repoLink('docs/sol-telecom-2380-derivation.md', commit) ?? ''}>
              docs/sol-telecom-2380-derivation.md
            </External>
          ) : (
            <span className="figure">docs/sol-telecom-2380-derivation.md</span>
          )}
          .
        </p>
      </section>

      <section id="monte-carlo" className={styles.section} aria-labelledby="mc-h">
        <h2 id="mc-h">Monte Carlo: many possible histories</h2>
        <p className={styles.prose}>These things are random in each run:</p>
        <ul className={styles.list}>
          {MONTE_CARLO.random.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className={styles.prose}>{MONTE_CARLO.eachRun}</p>
        {run && lastSeed !== null && (
          <p className={styles.prose}>
            The spread comes from {run.runCount} runs, seeds {run.firstSeed} to {lastSeed}. For every world the figures
            give the median year and the range covering the middle 80% of runs, from the 10th to the 90th percentile.
          </p>
        )}
        <p className={styles.prose}>{MONTE_CARLO.checked}</p>
        <p className={styles.prose}>{MONTE_CARLO.streams}</p>
        <p className={styles.prose}>{MONTE_CARLO.oneRun}</p>
      </section>

      <section id="invented" className={styles.section} aria-labelledby="invented-h">
        <h2 id="invented-h">What is invented</h2>
        <p className={styles.prose}>
          <CanonLabel kind="invented" /> Canon supplies the starting conditions and the deadlines. Everything below is a
          choice made for the setting.
        </p>
        <dl className={styles.prose}>
          {INVENTED.map(([name, text]) => (
            <div key={name}>
              <dt style={{ fontWeight: 650 }}>{name}</dt>
              <dd style={{ margin: '0 0 6px' }}>{text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="sources" className={styles.section} aria-labelledby="sources-h">
        <h2 id="sources-h">Sources and downloads</h2>
        <h3 className={styles.sub}>Star Trek canon, from Memory Alpha</h3>
        {meta && (
          <ul className={styles.list} aria-label="Memory Alpha sources">
            {meta.sources
              .filter((s) => s.id.startsWith('ma-'))
              .map((s) => (
                <li key={s.id}>
                  <External href={s.url}>{s.title}</External>
                </li>
              ))}
          </ul>
        )}
        <h3 className={styles.sub}>Astronomy and the stardate</h3>
        <ul className={styles.list}>
          {[...SOURCES.astronomy, SOURCES.stardate].map((s) => (
            <li key={s.url}>
              <External href={s.url}>{s.label}</External>
            </li>
          ))}
        </ul>
        <h3 className={styles.sub}>Downloads</h3>
        <ul className={styles.list} aria-label="Downloads">
          {[
            ['The dataset (one run, seed 1701)', 'backend/data/sol-telecom-2380.json'],
            ['The Monte Carlo summary (400 runs)', 'backend/data/sol-montecarlo-2380.json'],
            ['The derivation document', 'docs/sol-telecom-2380-derivation.md'],
          ].map(([label, path]) => {
            const url = repoLink(path, commit);
            return (
              <li key={path}>
                {url ? <External href={url}>{label}</External> : label}{' '}
                <span className={`${styles.note} figure`}>{path}</span>
              </li>
            );
          })}
        </ul>
        <p className={styles.prose}>{SOURCES.disclaimer}</p>
      </section>
    </div>
  );
}
