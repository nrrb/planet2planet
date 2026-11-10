import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useCompanies, useQuote, useRegions, useWorlds } from '../api/hooks';
import type { Offer } from '../api/types';
import { DEFAULT_FROM, DEFAULT_TO } from '../config';
import { CompareSheet } from '../features/compare-sheet/CompareSheet';
import {
  activeFilterCount,
  chooseWorld,
  MAX_COMPARE,
  quoteParamsFrom,
  swapWorlds,
  toggleCompare,
  withoutFilters,
} from '../features/compare/params';
import { useCompareParams } from '../features/compare/useCompareParams';
import { Filters } from '../features/filters/Filters';
import { InquiryForm } from '../features/inquiry/InquiryForm';
import { RouteDialogContent } from '../features/route-dialog/RouteDialogContent';
import { RoutePicker } from '../features/route-picker/RoutePicker';
import { RouteSummary } from '../features/route-summary/RouteSummary';
import { companyMap } from '../features/results/providers';
import { Results } from '../features/results/Results';
import { Dialog } from '../ui/Dialog';
import { useMediaQuery } from '../ui/useMediaQuery';
import styles from './ComparePage.module.css';

export function ComparePage() {
  const [state, update] = useCompareParams();
  const worlds = useWorlds();
  const regions = useRegions();
  const companies = useCompanies();
  const quote = useQuote(quoteParamsFrom(state));
  const wide = useMediaQuery('(min-width: 768px)');

  const [routeOffer, setRouteOffer] = useState<Offer | null>(null);
  const [inquiryOffer, setInquiryOffer] = useState<Offer | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const companyById = useMemo(() => companyMap(companies.data), [companies.data]);
  const nameOf = (id: string | null) => worlds.data?.find((w) => w.id === id)?.name ?? id ?? '';

  useEffect(() => {
    document.title =
      state.from && state.to
        ? `${nameOf(state.from)} to ${nameOf(state.to)}: Planet2Planet`
        : 'Planet2Planet: compare subspace plans';
    // nameOf depends only on the worlds list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.from, state.to, worlds.data]);

  if (!state.from && !state.to) {
    return <Navigate to={`/?from=${DEFAULT_FROM}&to=${DEFAULT_TO}`} replace />;
  }

  const offers = quote.data?.offers;
  const comparedOffers = state.compare.flatMap((id) => offers?.find((o) => o.id === id) ?? []);
  const providers = (companies.data ?? []).filter(
    (c) =>
      c.status !== 'merged' &&
      c.worldIds.length > 0 &&
      ((state.from && state.to && c.worldIds.includes(state.from) && c.worldIds.includes(state.to)) ||
        (['gateway', 'regional'].includes(c.kind) &&
          ((state.from && c.worldIds.includes(state.from)) || (state.to && c.worldIds.includes(state.to))))),
  );
  const filterCount = activeFilterCount(state);
  const filters = <Filters state={state} update={update} providers={providers} />;
  const quoteable = Boolean(state.from && state.to);

  return (
    <div className={styles.page}>
      <div className={styles.titleRow}>
        <h1>Compare plans</h1>
        {quote.data && <span className={styles.stardate}>Stardate {quote.data.route.stardate}</span>}
      </div>
      <a className={styles.skip} href="#results">
        Skip to results
      </a>
      {worlds.data ? (
        <RoutePicker
          worlds={worlds.data}
          from={state.from}
          to={state.to}
          onChange={(end, world) => update((s) => chooseWorld(s, end, world))}
          onSwap={() => update(swapWorlds)}
        />
      ) : worlds.error ? (
        <p role="alert">
          Worlds could not be loaded.{' '}
          <button type="button" className={styles.button} onClick={() => void worlds.refetch()}>
            Try again
          </button>
        </p>
      ) : (
        <p role="status">Loading worlds…</p>
      )}
      {quote.data && regions.data && <RouteSummary route={quote.data.route} regions={regions.data} />}
      {!quoteable && <p>Choose two worlds to see the plans that connect them.</p>}
      {quoteable && (
        <div className={styles.toolbar}>
          {comparedOffers.length >= 2 && (
            <button type="button" className={`${styles.button} ${styles.accent}`} onClick={() => setCompareOpen(true)}>
              Compare {comparedOffers.length} plans
            </button>
          )}
          <button
            type="button"
            className={`${styles.button} ${styles.filterButton}`}
            onClick={() => setFiltersOpen(true)}
          >
            Filters{filterCount ? ` (${filterCount})` : ''}
          </button>
        </div>
      )}
      {quoteable && (
        <div className={styles.layout}>
          <aside className={styles.sidebar} aria-label="Filters">
            {wide && filters}
          </aside>
          <section id="results" aria-label="Results" tabIndex={-1}>
            <Results
              offers={offers}
              loading={quote.isFetching}
              error={quote.error}
              onRetry={() => void quote.refetch()}
              fromName={nameOf(state.from)}
              toName={nameOf(state.to)}
              sort={state.sort}
              onSort={(sort) => update((s) => ({ ...s, sort }))}
              filtered={filterCount > 0}
              onResetFilters={() => update(withoutFilters)}
              companies={companyById}
              from={state.from ?? ''}
              to={state.to ?? ''}
              compare={state.compare}
              maxCompare={MAX_COMPARE}
              openOffer={state.offer}
              onToggleCompare={(id) => update((s) => toggleCompare(s, id))}
              onToggleDetails={(id) => update((s) => ({ ...s, offer: s.offer === id ? null : id }))}
              onShowRoute={setRouteOffer}
              onRequest={setInquiryOffer}
            />
          </section>
        </div>
      )}

      <Dialog open={filtersOpen && !wide} onClose={() => setFiltersOpen(false)} title="Filters" sheet>
        {filters}
      </Dialog>
      <Dialog
        open={routeOffer !== null}
        onClose={() => setRouteOffer(null)}
        title={routeOffer ? `Route: ${routeOffer.title}` : 'Route'}
      >
        {routeOffer && <RouteDialogContent offer={routeOffer} />}
      </Dialog>
      <Dialog
        open={compareOpen && comparedOffers.length >= 2}
        onClose={() => setCompareOpen(false)}
        title="Compare plans"
      >
        <CompareSheet
          offers={comparedOffers}
          companies={companyById}
          onRemove={(id) => update((s) => toggleCompare(s, id))}
        />
      </Dialog>
      <Dialog open={inquiryOffer !== null} onClose={() => setInquiryOffer(null)} title="Request this plan">
        {inquiryOffer && (
          <InquiryForm
            offer={inquiryOffer}
            from={state.from ?? ''}
            to={state.to ?? ''}
            onDone={() => setInquiryOffer(null)}
          />
        )}
      </Dialog>
    </div>
  );
}
