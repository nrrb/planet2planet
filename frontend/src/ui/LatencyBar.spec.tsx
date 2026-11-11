import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { barPositions, LatencyBar } from './LatencyBar';

describe('LatencyBar', () => {
  it('places the span and the tick on the shared scale', () => {
    const p = barPositions({ now: 75, min: 50, max: 100, scaleMin: 0, scaleMax: 200 });
    expect(p).toEqual({ left: 25, width: 25, now: 37.5 });
  });

  it('keeps a visible sliver when the range is a point', () => {
    const p = barPositions({ now: 10, min: 10, max: 10, scaleMin: 0, scaleMax: 100 });
    expect(p.width).toBeGreaterThanOrEqual(3);
  });

  it('does not overflow the track at the right edge', () => {
    const p = barPositions({ now: 99, min: 99, max: 100, scaleMin: 0, scaleMax: 100 });
    expect(p.left + p.width).toBeLessThanOrEqual(100);
  });

  it('describes itself in text, not just visually', () => {
    render(<LatencyBar now={72.6} min={72.6} max={87.7} scaleMin={0} scaleMax={100} />);
    expect(screen.getByRole('img')).toHaveAccessibleName('72.6 ms today, ranging 72.6 ms to 87.7 ms over the year');
  });
});
