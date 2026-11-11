import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CanonLabel, type LabelKind, labelText } from './CanonLabel';

const KINDS: LabelKind[] = ['on-screen', 'reference-book', 'not-found', 'invented', 'real'];

describe('CanonLabel', () => {
  it.each(KINDS)('always writes out what %s means, never colour alone', (kind) => {
    render(<CanonLabel kind={kind} />);
    expect(screen.getByText(labelText(kind))).toBeVisible();
  });

  it('uses the three labels the plan names for canon', () => {
    expect(labelText('on-screen')).toBe('On screen');
    expect(labelText('reference-book')).toBe('Reference book');
    expect(labelText('invented')).toBe('Invented');
  });

  it('gives each kind a distinct word', () => {
    expect(new Set(KINDS.map(labelText)).size).toBe(KINDS.length);
  });
});
