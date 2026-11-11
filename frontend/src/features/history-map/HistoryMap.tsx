import { lazy, Suspense, useEffect, useId, useMemo, useState } from 'react';
import { useCompanies, useHistory, useNetwork, useWorlds } from '../../api/hooks';
import { WATCH } from '../../content/canon';
import { buildMapModel } from '../../map/adapter';
import { describeEvent } from '../timeline/events';
import { ChartFrame } from '../monte-carlo/ChartFrame';
import chart from '../monte-carlo/Charts.module.css';
import { countsAt, latestEvents, worldStatesAt, YEAR_MAX, YEAR_MIN } from './historyStates';
import styles from './HistoryMap.module.css';

const MapView = lazy(() => import('../../map/MapView'));
const NO_LINKS: never[] = [];
const NO_WORLDS: ReadonlySet<string> = new Set();
const YEARS_PER_SECOND = 10;

/** The history of the system year by year, on the map. Nothing moves until the visitor presses Play. */
export function HistoryMap() {
  const worlds = useWorlds();
  const network = useNetwork();
  const history = useHistory();
  const companies = useCompanies();
  const [year, setYear] = useState(YEAR_MIN);
  const [playing, setPlaying] = useState(false);
  const sliderId = useId();

  const model = useMemo(
    () => (worlds.data && network.data ? buildMapModel(worlds.data, network.data) : null),
    [worlds.data, network.data],
  );
  const events = history.data;
  const marks = useMemo(() => (events ? worldStatesAt(events, year) : undefined), [events, year]);
  const counts = useMemo(
    () => (events && companies.data ? countsAt(events, companies.data, year) : null),
    [events, companies.data, year],
  );
  const worldName = (id: string) => worlds.data?.find((w) => w.id === id)?.name ?? id;
  const companyName = (id: string) => companies.data?.find((c) => c.id === id)?.name ?? id;
  const news = events ? latestEvents(events, year, 3) : [];

  // Playing stops by itself at the last year; no state needs setting for that.
  const active = playing && year < YEAR_MAX;
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setYear((y) => Math.min(YEAR_MAX, y + 1)), 1000 / YEARS_PER_SECOND);
    return () => window.clearTimeout(timer);
  }, [active, year]);

  if (history.error || worlds.error || network.error) {
    return <p role="alert">The history could not be loaded. Try reloading the page.</p>;
  }
  if (!model || !events || !marks || !counts) return <p role="status">Loading the history…</p>;

  const controls = (
    <div className={styles.controls}>
      <div className={styles.row}>
        <output htmlFor={sliderId} className={styles.year}>
          {year}
        </output>
        <button
          type="button"
          className={styles.button}
          onClick={() => {
            if (year >= YEAR_MAX) {
              setYear(YEAR_MIN);
              setPlaying(true);
            } else setPlaying((p) => !p);
          }}
        >
          {active ? 'Pause' : year >= YEAR_MAX ? 'Play again' : 'Play'}
        </button>
        <input
          id={sliderId}
          className={styles.slider}
          type="range"
          min={YEAR_MIN}
          max={YEAR_MAX}
          step={1}
          value={year}
          aria-label="Year"
          aria-valuetext={`Year ${year}`}
          onChange={(e) => {
            setPlaying(false);
            setYear(Number(e.target.value));
          }}
        />
      </div>
      {/* Counts change every tick while playing, so they are only announced once it stops. */}
      <dl className={styles.counts} aria-live={active ? 'off' : 'polite'} aria-label={`Counts in ${year}`}>
        <div className={styles.count}>
          <dt>Worlds colonized</dt>
          <dd>{counts.colonized}</dd>
        </div>
        <div className={styles.count}>
          <dt>Subspace constellations</dt>
          <dd>{counts.subspace}</dd>
        </div>
        <div className={styles.count}>
          <dt>Conventional constellations</dt>
          <dd>{counts.conventional}</dd>
        </div>
        <div className={styles.count}>
          <dt>Worlds over a million</dt>
          <dd>{counts.million}</dd>
        </div>
        <div className={styles.count}>
          <dt>Telecom brands trading</dt>
          <dd>{counts.brands}</dd>
        </div>
      </dl>
      <ol className={styles.news} aria-label="Latest events">
        {news.length === 0 && <li>Nothing yet. The first relay satellite goes up in {YEAR_MIN}.</li>}
        {news.map((e, i) => {
          const d = describeEvent(e, { world: worldName, company: companyName });
          return (
            <li key={`${e.year}-${e.type}-${e.world}-${i}`}>
              <span className={styles.when}>{e.year}</span>
              <span>{d.title}</span>
            </li>
          );
        })}
      </ol>
      <ul className={styles.legend} aria-label="Map key">
        {WATCH.legend.map(([name, text]) => (
          <li key={name}>
            <strong>{name}</strong>: {text}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <ChartFrame
      title="The system, year by year"
      summary={`From ${YEAR_MIN}, the year of the first relay satellite, to ${YEAR_MAX}. With reduced motion the map changes between years without animating.`}
      controls={controls}
      chart={
        <Suspense fallback={<p role="status">Loading the map…</p>}>
          <MapView
            model={model}
            links={NO_LINKS}
            highlighted={NO_WORLDS}
            dimOthers={false}
            labelPlanets
            showAllMoons
            marks={marks}
            fitNodes={null}
            label={`Map of the Sol system in ${year}: ${counts.colonized} worlds colonized, ${counts.subspace} subspace constellations`}
            compact
          />
        </Suspense>
      }
      table={
        <table className={chart.table}>
          <caption className="visually-hidden">What each world has in {year}</caption>
          <thead>
            <tr>
              <th scope="col">World</th>
              <th scope="col">Constellation</th>
              <th scope="col">Colony</th>
            </tr>
          </thead>
          <tbody>
            {(worlds.data ?? []).map((w) => {
              const mark = marks.get(w.id);
              return (
                <tr key={w.id}>
                  <th scope="row">{w.name}</th>
                  <td>
                    {!mark || mark.constellation === 'none'
                      ? 'None yet'
                      : mark.constellation === 'subspace'
                        ? 'Subspace'
                        : 'Conventional (light speed)'}
                  </td>
                  <td>{mark?.colonized ? 'Founded' : 'Not yet'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      }
    />
  );
}
