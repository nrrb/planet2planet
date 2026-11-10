import { Fragment, type ReactNode } from 'react';
import type { Offer } from '../../api/types';
import { BADGE_LABELS } from '../../content/labels';
import { LatencyBar } from '../../ui/LatencyBar';
import { OfferDetails } from './OfferDetails';
import {
  classLabel,
  conjunctionLong,
  conjunctionShort,
  hardeningText,
  type OfferItemProps,
  sectorText,
  tierLabel,
} from './offerView';
import { providerLine } from './providers';
import { type SortDir, type SortKey } from './sorting';
import styles from './OfferTable.module.css';

const TAG_CLASS: Record<string, string> = {
  'lowest-price': styles.tagPrice,
  'lowest-latency': styles.tagLatency,
  'most-resilient': styles.tagResilient,
};

const plain = (n: number, digits = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const ms = (n: number) => (n >= 100 ? plain(n, 0) : plain(n, 1));

interface Column {
  key: SortKey | null;
  label: string;
  title: string;
  numeric?: boolean;
  cell: (props: OfferItemProps) => ReactNode;
}

const COLUMNS: Column[] = [
  {
    key: 'plan',
    label: 'Plan',
    title: 'Plan name',
    cell: ({ offer }) => (
      <span className={styles.plan}>
        <strong>{offer.title}</strong>
        {offer.kind === 'package' && <span className={styles.kind}>package</span>}
        {offer.badges.map((badge) => (
          <span key={badge} className={`${styles.tag} ${TAG_CLASS[badge] ?? ''}`}>
            {BADGE_LABELS[badge] ?? badge}
          </span>
        ))}
      </span>
    ),
  },
  {
    key: 'provider',
    label: 'Provider',
    title: 'Lead provider, and partners where the plan is a package or has a contracted partner',
    cell: ({ offer, companies }) => {
      const text = providerLine(offer, companies);
      return (
        <div className={styles.provider} title={text}>
          {text}
        </div>
      );
    },
  },
  {
    key: 'price',
    label: 'Monthly cr',
    title: 'Monthly price in credits',
    numeric: true,
    cell: ({ offer }) => plain(offer.price.monthly),
  },
  {
    key: 'setup',
    label: 'Setup cr',
    title: 'One-time setup fee in credits',
    numeric: true,
    cell: ({ offer }) => plain(offer.price.setup),
  },
  {
    key: 'latency',
    label: 'Now ms',
    title: 'One-way latency today, in milliseconds',
    numeric: true,
    cell: ({ offer }) => ms(offer.latencyMs.now),
  },
  {
    key: 'min-latency',
    label: 'Min ms',
    title: 'Best one-way latency over the year, in milliseconds',
    numeric: true,
    cell: ({ offer }) => ms(offer.latencyMs.min),
  },
  {
    key: 'worst-latency',
    label: 'Max ms',
    title: 'Worst-case one-way latency over the year, in milliseconds',
    numeric: true,
    cell: ({ offer }) => ms(offer.latencyMs.max),
  },
  {
    key: null,
    label: 'Year range',
    title: 'Latency range over the year on one shared scale; the tick is today',
    cell: ({ offer, scale }) => (
      <LatencyBar
        now={offer.latencyMs.now}
        min={offer.latencyMs.min}
        max={offer.latencyMs.max}
        scaleMin={scale.min}
        scaleMax={scale.max}
      />
    ),
  },
  { key: 'class', label: 'Class', title: 'Service class', cell: ({ offer }) => classLabel(offer) },
  {
    key: 'throughput',
    label: 'Gq/s',
    title: 'Committed throughput in gigaquads per second',
    numeric: true,
    cell: ({ offer }) => offer.throughput,
  },
  { key: 'tier', label: 'Redundancy', title: 'Redundancy tier', cell: ({ offer }) => tierLabel(offer) },
  { key: 'hops', label: 'Hops', title: 'Relay hops on the route', numeric: true, cell: ({ offer }) => offer.hops },
  {
    key: 'handoffs',
    label: 'Hand-offs',
    title: 'Times traffic changes carrier',
    numeric: true,
    cell: ({ offer }) => offer.handoffs,
  },
  {
    key: 'share',
    label: 'Lead %',
    title: "Share of the route on the lead provider's own network",
    numeric: true,
    cell: ({ offer }) => Math.round(offer.onNetworkShare * 100),
  },
  {
    key: 'conjunction',
    label: 'Conjunction',
    title: 'Behaviour during solar conjunction',
    cell: ({ offer }) => <span title={conjunctionLong(offer)}>{conjunctionShort(offer)}</span>,
  },
  {
    key: null,
    label: 'Hardened for',
    title: 'Environments the plan is hardened for',
    cell: ({ offer }) => hardeningText(offer),
  },
  { key: null, label: 'Sectors', title: 'Sectors the plan suits', cell: ({ offer }) => sectorText(offer) },
];

function Head({
  column,
  sort,
  dir,
  onSort,
}: {
  column: Column;
  sort: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = column.key === sort;
  return (
    <th
      scope="col"
      title={column.title}
      className={`${column.numeric ? styles.right : ''} ${column.key === 'plan' ? styles.stick2 : ''}`}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : column.key ? 'none' : undefined}
    >
      {column.key ? (
        <button type="button" className={styles.headButton} onClick={() => onSort(column.key as SortKey)}>
          {column.label}
          {active && (
            <span className={styles.arrow} aria-hidden="true">
              {dir === 'asc' ? '▲' : '▼'}
            </span>
          )}
        </button>
      ) : (
        <span className={styles.headStatic}>{column.label}</span>
      )}
    </th>
  );
}

function Row(props: OfferItemProps) {
  const { offer, compared, compareFull, detailsOpen } = props;
  const rowClass = [compared ? styles.compared : '', detailsOpen ? styles.open : ''].join(' ');
  return (
    <Fragment>
      <tr className={rowClass}>
        <td className={styles.stick1}>
          <input
            className={styles.check}
            type="checkbox"
            checked={compared}
            disabled={!compared && compareFull}
            onChange={props.onToggleCompare}
            aria-label={`Compare ${offer.title}`}
          />
        </td>
        {COLUMNS.map((column) => (
          <td
            key={column.label}
            className={`${column.numeric ? styles.num : ''} ${column.key === 'plan' ? styles.stick2 : ''} ${column.label === 'Year range' ? styles.range : ''}`}
          >
            {column.cell(props)}
          </td>
        ))}
        <td className={styles.stickR}>
          <span className={styles.actions}>
            <button type="button" className={styles.mini} onClick={props.onShowRoute}>
              Route
            </button>
            <button type="button" className={styles.mini} aria-expanded={detailsOpen} onClick={props.onToggleDetails}>
              {detailsOpen ? 'Hide' : 'Details'}
            </button>
            <button type="button" className={`${styles.mini} ${styles.request}`} onClick={props.onRequest}>
              Request
            </button>
          </span>
        </td>
      </tr>
      {detailsOpen && (
        <tr className={styles.open}>
          <td colSpan={COLUMNS.length + 2} className={styles.detailsCell}>
            <div className={styles.detailsInner}>
              <OfferDetails offer={offer} from={props.from} to={props.to} id={`details-${offer.id}`} />
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

interface TableProps {
  offers: Offer[];
  sort: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  rowProps: (offer: Offer) => OfferItemProps;
}

/** Every attribute of every plan as a sortable column, in a grid that scrolls inside its frame. */
export function OfferTable({ offers, sort, dir, onSort, rowProps }: TableProps) {
  return (
    <>
      {/* A scrollable region needs to be focusable so keyboard users can scroll it. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className={styles.wrap} tabIndex={0} role="region" aria-label="Plans, scrollable table">
        <table className={styles.table}>
          <caption className="visually-hidden">Plans that connect the two worlds</caption>
          <thead>
            <tr>
              <th scope="col" className={styles.stick1} title="Choose up to three plans to compare side by side">
                <span className="visually-hidden">Compare</span>
              </th>
              {COLUMNS.map((column) => (
                <Head key={column.label} column={column} sort={sort} dir={dir} onSort={onSort} />
              ))}
              <th scope="col" className={styles.stickR}>
                <span className={styles.headStatic}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {offers.map((offer) => (
              <Row key={offer.id} {...rowProps(offer)} />
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.units}>
        Prices are in credits (cr) a month. Latency is one-way, in milliseconds: today at the site date, then the best
        and worst over the year. Gq/s is gigaquads per second. Lead % is the share of the route on the lead
        provider&rsquo;s own network.
      </p>
    </>
  );
}
