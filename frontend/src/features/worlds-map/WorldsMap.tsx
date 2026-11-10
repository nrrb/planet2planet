import { lazy, Suspense, useMemo, useState } from 'react';
import { useNetwork, useWorlds } from '../../api/hooks';
import { buildMapModel } from '../../map/adapter';
import styles from './WorldsMap.module.css';

const MapView = lazy(() => import('../../map/MapView'));
const KEY = 'p2p-map-hidden';
const NO_LINKS: never[] = [];

function storedHidden(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

interface Props {
  from: string | null;
  to: string | null;
}

/**
 * The whole system, animated, with the chosen origin and destination highlighted. Worlds are
 * chosen with the form below it; the map only reflects the choice, and draws no route.
 */
export function WorldsMap({ from, to }: Props) {
  const worlds = useWorlds();
  const network = useNetwork();
  const [hidden, setHidden] = useState(storedHidden);

  const model = useMemo(
    () => (worlds.data && network.data ? buildMapModel(worlds.data, network.data) : null),
    [worlds.data, network.data],
  );
  const markers = useMemo(() => {
    const out = new Map<string, 'from' | 'to'>();
    if (from) out.set(from, 'from');
    if (to) out.set(to, 'to');
    return out;
  }, [from, to]);
  const highlighted = useMemo(() => new Set(markers.keys()), [markers]);

  function toggle() {
    setHidden((value) => {
      try {
        window.localStorage.setItem(KEY, value ? '0' : '1');
      } catch {
        /* the choice still applies for this visit */
      }
      return !value;
    });
  }

  const name = (id: string | null) => worlds.data?.find((w) => w.id === id)?.name;
  const label = `Map of the Sol system${from && to ? `, with ${name(from) ?? from} as the origin and ${name(to) ?? to} as the destination` : ''}`;

  return (
    <section className={styles.band} aria-label="Map of the Sol system">
      <div className={styles.head}>
        <span className={styles.title}>Sol system</span>
        <button type="button" className={styles.toggle} aria-expanded={!hidden} onClick={toggle}>
          {hidden ? 'Show map' : 'Hide map'}
        </button>
      </div>
      {!hidden && model && (
        <Suspense fallback={<p role="status">Loading the map…</p>}>
          <MapView
            model={model}
            links={NO_LINKS}
            highlighted={highlighted}
            markers={markers}
            dimOthers={false}
            labelPlanets
            showAllMoons
            fitNodes={null}
            label={label}
            compact
          />
        </Suspense>
      )}
      {!hidden && !model && !worlds.error && !network.error && <p role="status">Loading the map…</p>}
      {!hidden && (worlds.error || network.error) && (
        <p role="status">The map could not be loaded. You can still choose worlds below.</p>
      )}
    </section>
  );
}
