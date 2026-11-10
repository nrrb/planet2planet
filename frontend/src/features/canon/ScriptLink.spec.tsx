import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { repoLink } from '../../config';
import { ScriptLink } from './ScriptLink';

const COMMIT = 'f115c203b6caf71e22b8af776bc0a6d9ead0f5c4';

describe('repoLink', () => {
  it('points at the file at the recorded commit', () => {
    expect(repoLink('tools/colonization-sim.js', COMMIT, 'https://github.com/example/p2p')).toBe(
      `https://github.com/example/p2p/blob/${COMMIT}/tools/colonization-sim.js`,
    );
  });

  it('gives nothing when no repository is configured, rather than a broken link', () => {
    expect(repoLink('tools/colonization-sim.js', COMMIT, null)).toBeNull();
  });
});

describe('ScriptLink', () => {
  it('names the script and the short commit, as text, when there is no repository to link to', () => {
    render(<ScriptLink commit={COMMIT} />);
    expect(screen.getByText('tools/colonization-sim.js')).toBeInTheDocument();
    expect(screen.getByText('f115c20')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
