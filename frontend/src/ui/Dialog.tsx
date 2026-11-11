import { type ReactNode, useEffect, useRef } from 'react';
import styles from './Dialog.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** A bottom sheet on phones instead of a full-screen panel. */
  sheet?: boolean;
}

/**
 * Safari does not focus a button when it is clicked, so document.activeElement is the body when a dialog
 * opens from a mouse or touch press. Remember the last pressed control so focus can still be handed back.
 */
let lastPressed: HTMLElement | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener(
    'pointerdown',
    (event) => {
      lastPressed = event.target instanceof Element ? event.target.closest<HTMLElement>('button, a') : null;
    },
    true,
  );
  // A keyboard press means the focused element is the real opener again.
  document.addEventListener('keydown', () => (lastPressed = null), true);
}

function currentOpener(): HTMLElement | null {
  // Safari may focus a scroll container around the button instead, so a pressed control wins over focus.
  if (lastPressed?.isConnected) return lastPressed;
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body ? active : null;
}

/** A modal dialog: traps focus, closes with Escape, and returns focus to whatever opened it. */
export function Dialog({ open, onClose, title, children, sheet = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = currentOpener();
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      opener.current?.focus();
      opener.current = null;
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => {
      // Fired by Escape. Hand focus back, then tell the parent.
      opener.current?.focus();
      opener.current = null;
      onCloseRef.current();
    };
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };
    // A click on the backdrop lands on the dialog element itself.
    const handleBackdrop = (event: MouseEvent) => {
      if (event.target === dialog) onCloseRef.current();
    };
    dialog.addEventListener('close', handleClose);
    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('click', handleBackdrop);
    return () => {
      dialog.removeEventListener('close', handleClose);
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('click', handleBackdrop);
    };
  }, []);

  return (
    <dialog ref={ref} className={`${styles.dialog} ${sheet ? styles.sheet : ''}`} aria-label={title}>
      {open && (
        <div className={styles.panel}>
          <div className={styles.head}>
            <h2>{title}</h2>
            <button type="button" className={styles.close} onClick={onClose}>
              Close
            </button>
          </div>
          <div className={styles.body}>{children}</div>
        </div>
      )}
    </dialog>
  );
}
