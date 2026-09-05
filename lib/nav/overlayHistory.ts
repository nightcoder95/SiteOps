/**
 * History plumbing for the global search overlay.
 *
 * While the overlay is open we push a sentinel entry so the browser back
 * button / swipe-back gesture dismisses the overlay instead of leaving the
 * page. On teardown the sentinel has to be popped again — but NOT when the
 * overlay closed because the user picked a result: in that case the overlay
 * closes and the router navigates in the same tick, so popping would undo the
 * navigation and the deep link (?highlight=<id>) never lands.
 */

export type HistoryLike = {
  readonly state: unknown;
  pushState(state: unknown, unused: string): void;
  back(): void;
};

export const OVERLAY_HISTORY_KEY = "searchOverlay";

function isOverlayEntry(state: unknown): boolean {
  return Boolean((state as Record<string, unknown> | null)?.[OVERLAY_HISTORY_KEY]);
}

/** Push the sentinel entry that back/swipe-back will pop to dismiss the overlay. */
export function pushOverlayEntry(history: HistoryLike): void {
  history.pushState({ [OVERLAY_HISTORY_KEY]: true }, "");
}

/**
 * Pop the sentinel on teardown. Skipped when the close was caused by a
 * navigation, and when the sentinel is already gone (a real popstate consumed
 * it), so we never eat an unrelated history entry.
 */
export function popOverlayEntry(
  history: HistoryLike,
  { navigating }: { navigating: boolean },
): void {
  if (navigating) return;
  if (!isOverlayEntry(history.state)) return;
  history.back();
}
