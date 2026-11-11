import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Dialog } from './Dialog';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div tabIndex={0} role="group" aria-label="Scroller" data-testid="scroller">
        <button type="button" onClick={() => setOpen(true)}>
          Open
        </button>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Thing">
        <button type="button" onClick={() => setOpen(false)}>
          Done
        </button>
      </Dialog>
    </>
  );
}

describe('Dialog focus return', () => {
  it('hands focus back to the pressed button even when the browser focused a scroll container instead (Safari)', () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    // Safari: pressing the button focuses the nearest focusable ancestor, not the button.
    fireEvent.pointerDown(opener);
    screen.getByTestId('scroller').focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: 'Done', hidden: true }));
    expect(opener).toHaveFocus();
  });

  it('uses the focused element when it was opened from the keyboard', () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.keyDown(opener, { key: 'Enter' });
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: 'Done', hidden: true }));
    expect(opener).toHaveFocus();
  });
});
