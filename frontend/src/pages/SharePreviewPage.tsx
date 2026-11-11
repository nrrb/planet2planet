import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useCompanies, useNetwork, useQuote, useWorlds } from '../api/hooks';
import { buildMapModel, routeRenderLinks } from '../map/adapter';
import { formatDuration } from '../ui/format';
import styles from './SharePreviewPage.module.css';

const MapView = lazy(() => import('../map/MapView'));

const FROM = 'earth';
const TO = 'eris';

/**
 * The picture used when the site is shared as a link. It is a fixed 1200 by 630 composition of the
 * whole system with the fastest Earth to Eris route lit, drawn from the live data. e2e/scripts/generate-og.mjs
 * photographs this page into public/og.png. Visitors never link to it, and search engines are told to skip it.
 */
export default function SharePreviewPage() {
  const worlds = useWorlds();
  const network = useNetwork();
  const companies = useCompanies();
  const quote = useQuote({ from: FROM, to: TO });

  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.append(meta);
    return () => {
      meta.remove();
    };
  }, []);

  const model = useMemo(
    () => (worlds.data && network.data ? buildMapModel(worlds.data, network.data) : null),
    [worlds.data, network.data],
  );
  const best = useMemo(
    () => quote.data?.offers.reduce((a, b) => (b.latencyMs.now < a.latencyMs.now ? b : a)),
    [quote.data],
  );
  const links = useMemo(() => {
    if (!model || !best) return [];
    // Only the route itself: the carrier's other long-haul links would bury it at share-image size.
    return routeRenderLinks(model, best, new Map((companies.data ?? []).map((c) => [c.id, c]))).filter(
      (link) => link.emphasis === 'route',
    );
  }, [model, best, companies.data]);
  const highlighted = useMemo(() => new Set([FROM, TO]), []);
  const fitNodes = useMemo(() => [...new Set((best?.segments ?? []).flatMap((s) => s.nodeIds))], [best]);
  const worldName = (id: string) => worlds.data?.find((w) => w.id === id)?.name ?? id;

  return (
    <div className={styles.stage} data-ready={model && best ? 'true' : 'false'}>
      {model && best && (
        <Suspense fallback={null}>
          <MapView
            model={model}
            links={links}
            highlighted={highlighted}
            dimOthers
            labelPlanets={false}
            fitNodes={fitNodes}
            label="The Sol system with the fastest route from Earth to Eris"
            bare
          />
        </Suspense>
      )}
      <div className={`${styles.panel} ${styles.left}`}>
        <h1 className={styles.name}>Planet2Planet</h1>
        <p className={styles.tag}>Compare subspace plans between any two worlds in the Sol system</p>
      </div>
      {best && (
        <div className={`${styles.panel} ${styles.right}`}>
          <p className={styles.route}>
            {worldName(FROM)} to {worldName(TO)}
          </p>
          <p className={styles.figure}>{formatDuration(best.latencyMs.now / 1000)}</p>
          <p className={styles.caption}>one way, on the fastest plan</p>
        </div>
      )}
    </div>
  );
}
