/** Number formatting for figures shown in the UI. */
const GROUPED = new Intl.NumberFormat('en-US');

export const formatCredits = (credits: number): string => `${GROUPED.format(credits)} cr`;

export function formatLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)} s`;
  if (ms >= 100) return `${Math.round(ms)} ms`;
  if (ms >= 1) return `${ms.toFixed(1)} ms`;
  return `${ms.toFixed(3)} ms`;
}

export const formatLatencyRange = (min: number, max: number): string =>
  `${formatLatency(min)} to ${formatLatency(max)}`;

const KM_PER_AU = 149_597_870.7;

export function formatDistance(km: number): string {
  const au = km / KM_PER_AU;
  const auText = au >= 10 ? au.toFixed(1) : au >= 0.1 ? au.toFixed(2) : au.toFixed(3);
  return `${GROUPED.format(Math.round(km))} km (${auText} AU)`;
}

export function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export const formatShare = (share: number): string => `${Math.round(share * 100)}%`;

/** A span of seconds in the largest sensible unit: 1.3 seconds, 12 minutes, 9.5 hours. */
export function formatDuration(seconds: number): string {
  const trim = (n: number) => (n >= 10 ? n.toFixed(0) : n.toFixed(1)).replace(/\.0$/, '');
  if (seconds < 120) return `${trim(seconds)} ${seconds === 1 ? 'second' : 'seconds'}`;
  if (seconds < 7200) return `${trim(seconds / 60)} minutes`;
  if (seconds < 172_800) return `${trim(seconds / 3600)} hours`;
  return `${trim(seconds / 86_400)} days`;
}

/** One reading, or a range when the two ends differ meaningfully. */
export function formatSpan(min: number, max: number, format: (n: number) => string): string {
  const close = Math.abs(max - min) <= Math.max(Math.abs(max), Math.abs(min)) * 0.01;
  return close ? `about ${format((min + max) / 2)}` : `${format(min)} to ${format(max)}`;
}
