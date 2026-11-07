'use client';
// Shared modal-dialog focus rule: when a dialog opens, move focus into it; keep
// Tab inside it; when it closes, give focus back to whatever opened it. Used by
// the member drawer, the Bible dock, the announcement drawer and the phone menu
// so every modal behaves the same way (WCAG 2.4.3 focus order, 2.1.2 no trap
// outside the dialog).
import { useEffect, type RefObject } from 'react';
import { FOCUSABLE, trapTarget } from '../lib/focus';

export function useDialogFocus(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;
    const restoreTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = (): HTMLElement[] =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);

    // Focus the container so a screen reader announces the dialog's name first.
    node.focus();

    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return;
      const els = focusables();
      const current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const target = trapTarget(els.length, els.indexOf(current as HTMLElement), e.shiftKey);
      if (target !== null) {
        e.preventDefault();
        (target === -1 ? node : els[target]).focus();
        return;
      }
      // Focus slipped behind the scrim — pull it back into the dialog.
      if (!current || !node.contains(current)) {
        e.preventDefault();
        (els[0] ?? node).focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (restoreTo && document.contains(restoreTo)) restoreTo.focus();
    };
  }, [active, ref]);
}