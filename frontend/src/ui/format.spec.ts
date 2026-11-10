import { describe, expect, it } from 'vitest';
import {
  formatCredits,
  formatDate,
  formatDistance,
  formatDuration,
  formatLatency,
  formatLatencyRange,
  formatShare,
  formatSpan,
} from './format';

describe('formatting', () => {
  it('groups credits', () => {
    expect(formatCredits(4180)).toBe('4,180 cr');
    expect(formatCredits(12)).toBe('12 cr');
  });

  it('chooses sensible latency precision and units', () => {
    expect(formatLatency(0.025)).toBe('0.025 ms');
    expect(formatLatency(5.04)).toBe('5.0 ms');
    expect(formatLatency(72.6)).toBe('72.6 ms');
    expect(formatLatency(650.4)).toBe('650 ms');
    expect(formatLatency(1300)).toBe('1.3 s');
    expect(formatLatency(32400)).toBe('32 s');
    expect(formatLatencyRange(72.6, 87.7)).toBe('72.6 ms to 87.7 ms');
  });

  it('shows distance in km and AU', () => {
    expect(formatDistance(1_092_764_447)).toBe('1,092,764,447 km (7.30 AU)');
    expect(formatDistance(384_400)).toBe('384,400 km (0.003 AU)');
  });

  it('formats dates without timezone drift', () => {
    expect(formatDate('2380-06-09')).toBe('9 Jun 2380');
    expect(formatDate('2381-01-01')).toBe('1 Jan 2381');
  });

  it('formats shares as percentages', () => {
    expect(formatShare(0.456)).toBe('46%');
  });

  it('picks the largest sensible unit for a duration', () => {
    expect(formatDuration(1.28)).toBe('1.3 seconds');
    expect(formatDuration(45)).toBe('45 seconds');
    expect(formatDuration(1500)).toBe('25 minutes');
    expect(formatDuration(34_320)).toBe('9.5 hours');
    expect(formatDuration(400_000)).toBe('4.6 days');
  });

  it('shows one reading when the ends agree and a range when they do not', () => {
    expect(formatSpan(0.0247, 0.0247, formatLatency)).toBe('about 0.025 ms');
    expect(formatSpan(5.03, 24.22, formatLatency)).toBe('5.0 ms to 24.2 ms');
  });
});
