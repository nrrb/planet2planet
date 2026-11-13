/**
 * Small helpers that make the browser engine reproduce the numbers the Python backend produced.
 * Python's round() rounds halves to even and its sha1/date handling is exact, so the same rules
 * are applied here: prices, ids and sort order stay identical to the full-stack version.
 */

/** Python's round(x): halves go to the nearest even integer. */
export function pyRound(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Python's round(x, digits): rounds the exact binary value, halves to even. */
export function pyRoundTo(x: number, digits: number): number {
  if (!Number.isFinite(x)) return x;
  // toFixed is exact but sends an exact tie (0.125 to two places) up; Python sends it to even.
  const long = Math.abs(x).toFixed(Math.min(100, digits + 40));
  const tail = long.slice(long.length - 40);
  if (/^50*$/.test(tail)) {
    const down = Number(long.slice(0, long.length - 40));
    const lastDigit = Number(down.toFixed(digits).replace('.', '').slice(-1));
    const rounded = lastDigit % 2 === 0 ? down : down + 10 ** -digits;
    return Number((x < 0 ? -rounded : rounded).toFixed(digits));
  }
  return Number(x.toFixed(digits));
}

/** Python's a % b for a positive b: the result is never negative. */
export const pyMod = (a: number, b: number): number => ((a % b) + b) % b;

/** Compares strings by code unit, as Python (and the database collation used for the golden files) does. */
export const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Compares two tuples of numbers and strings, left to right. */
export function compareTuples(a: readonly (number | string)[], b: readonly (number | string)[]): number {
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

// --- Dates. A day is an ISO string, 'YYYY-MM-DD', so it works as a cache key. ---

const MS_PER_DAY = 86_400_000;
const J2000_MS = Date.UTC(2000, 0, 1, 12);

export function dayToMs(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d, 12);
}

export function addDays(day: string, days: number): string {
  return new Date(dayToMs(day) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Days from J2000 (noon on 1 January 2000, UTC) to noon on `day`. */
export const daysSinceJ2000 = (day: string): number => (dayToMs(day) - J2000_MS) / MS_PER_DAY;

// --- SHA-1, synchronous, for offer ids. Not used for anything secret. ---

export function sha1Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i += 1) words[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
  const bitLength = bytes.length * 8;
  words[bitLength >> 5] |= 0x80 << (24 - (bitLength % 32));
  words[(((bitLength + 64) >> 9) << 4) + 15] = bitLength;

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Array<number>(80);
  const rotl = (n: number, s: number) => (n << s) | (n >>> (32 - s));

  for (let i = 0; i < words.length; i += 16) {
    for (let t = 0; t < 80; t += 1) {
      w[t] = t < 16 ? (words[i + t] ?? 0) : rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let t = 0; t < 80; t += 1) {
      let f: number;
      let k: number;
      if (t < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (t < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (t < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotl(a, 5) + f + e + k + w[t]) | 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }
  return [h0, h1, h2, h3, h4].map((n) => (n >>> 0).toString(16).padStart(8, '0')).join('');
}
