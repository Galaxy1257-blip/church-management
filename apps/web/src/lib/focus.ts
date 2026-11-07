// Focus management for modal dialogs. The boundary maths is a pure function so
// it can be unit-tested without a DOM; the hook (components/use-dialog-focus.ts)
// does the DOM glue. One rule, shared by every drawer in the app.

export const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Given the focusable elements inside a dialog and where focus is now, decide
// whether Tab must be forced to wrap. Returns the index to focus, -1 to focus
// the dialog container itself (no focusables), or null to let the browser move
// focus normally. `current` is -1 when focus is on the container or outside.
export function trapTarget(length: number, current: number, shiftKey: boolean): number | null {
  if (length <= 0) return -1;
  if (shiftKey) {
    // From the first element (or the container) Shift+Tab wraps to the last.
    if (current === 0 || current === -1) return length - 1;
    return null;
  }
  // From the last element Tab wraps to the first.
  if (current === length - 1) return 0;
  return null;
}