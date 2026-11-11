import { useId, useMemo, useState } from 'react';
import { useCompanies, useHistory, useWorlds } from '../../api/hooks';
import { buildTimeline, EVENT_TYPES, FILTER_GROUPS, type GroupId, milestoneKeys, type TimelineItem } from './events';
import styles from './Timeline.module.css';

const SHOWN_PER_YEAR = 3;
const GROUP_IDS = Object.keys(FILTER_GROUPS) as GroupId[];

function Item({ item }: { item: TimelineItem }) {
  const meta = EVENT_TYPES[item.type];
  return (
    <li className={`${styles.item} ${styles[meta.tone]} ${item.milestone ? styles.milestone : ''}`}>
      <span className={styles.glyph} aria-hidden="true">
        {meta.glyph}
      </span>
      <div>
        <span className={styles.kind}>{meta.label}</span>
        <span className={styles.title}>{item.title}</span>
        {item.milestone && !item.canon && <span className={styles.key}>Key milestone</span>}
        {item.detail && <div className={styles.detail}>{item.detail}</div>}
      </div>
    </li>
  );
}

function Year({ year, items }: { year: number; items: TimelineItem[] }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const hidden = items.length > SHOWN_PER_YEAR && !open ? items.length - SHOWN_PER_YEAR : 0;
  const shown = hidden ? items.slice(0, SHOWN_PER_YEAR) : items;
  return (
    <li className={styles.year}>
      <span className={`${styles.yearLabel} figure`}>{year}</span>
      <ul className={styles.items} id={listId}>
        {shown.map((item) => (
          <Item key={item.key} item={item} />
        ))}
        {(hidden > 0 || (open && items.length > SHOWN_PER_YEAR)) && (
          <li>
            <button
              type="button"
              className={styles.more}
              aria-expanded={open}
              aria-controls={listId}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? 'Show fewer' : `+${hidden} ${hidden === 1 ? 'event' : 'events'}`}
            </button>
          </li>
        )}
      </ul>
    </li>
  );
}

/** Sol's networks, year by year, from the dated events in the dataset. */
export function Timeline() {
  const history = useHistory();
  const worlds = useWorlds();
  const companies = useCompanies();
  const [groups, setGroups] = useState<ReadonlySet<GroupId>>(new Set(GROUP_IDS));
  const [milestonesOnly, setMilestonesOnly] = useState(false);

  const events = history.data;
  const milestones = useMemo(
    () =>
      events && worlds.data && companies.data ? milestoneKeys(events, worlds.data, companies.data) : new Set<string>(),
    [events, worlds.data, companies.data],
  );
  const eras = useMemo(() => {
    if (!events) return [];
    const world = (id: string) => worlds.data?.find((w) => w.id === id)?.name ?? id;
    const company = (id: string) => companies.data?.find((c) => c.id === id)?.name ?? id;
    return buildTimeline(events, { groups, milestonesOnly }, milestones, { world, company });
  }, [events, worlds.data, companies.data, groups, milestonesOnly, milestones]);

  if (history.error) return <p role="alert">The history could not be loaded. Try reloading the page.</p>;
  if (!events) return <p role="status">Loading the history…</p>;

  const shownCount = eras.reduce(
    (sum, era) => sum + era.years.reduce((s, y) => s + y.items.filter((i) => !i.canon).length, 0),
    0,
  );
  const toggle = (id: GroupId) =>
    setGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      <fieldset className={styles.controls}>
        <legend>Show</legend>
        {GROUP_IDS.map((id) => (
          <label key={id} className={styles.option}>
            <input type="checkbox" checked={groups.has(id)} onChange={() => toggle(id)} />
            {FILTER_GROUPS[id].label}
          </label>
        ))}
        <label className={styles.option}>
          <input type="checkbox" checked={milestonesOnly} onChange={() => setMilestonesOnly((v) => !v)} />
          Key milestones only
        </label>
        <span className={styles.count} role="status" aria-live="polite">
          {shownCount} of {events.length} events
        </span>
      </fieldset>
      <div className={styles.jump}>
        <span>Jump to</span>
        {eras.map(({ era }) => (
          <button
            key={era.id}
            type="button"
            className={styles.jumpButton}
            onClick={() =>
              document.getElementById(`era-${era.id}`)?.scrollIntoView?.({ inline: 'start', block: 'nearest' })
            }
          >
            {era.label}
          </button>
        ))}
      </div>
      {/* A scrollable region must be focusable so keyboard users can scroll it. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className={styles.track} role="region" aria-label="Timeline, scrollable" tabIndex={0}>
        <div className={styles.eras}>
          {eras.map(({ era, years }) => (
            <section key={era.id} id={`era-${era.id}`} className={styles.era} aria-label={era.label}>
              <header className={styles.eraHead}>
                <h3>{era.label}</h3>
                <span>{era.blurb}</span>
              </header>
              <ol className={styles.years}>
                {years.map((y) => (
                  <Year key={y.year} year={y.year} items={y.items} />
                ))}
              </ol>
            </section>
          ))}
          {shownCount === 0 && (
            <p className={styles.empty}>Nothing matches these filters. Choose at least one kind of event.</p>
          )}
        </div>
      </div>
    </div>
  );
}
