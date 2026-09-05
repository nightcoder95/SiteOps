"use client";

import { useEffect, type RefObject } from "react";

import { popOverlayEntry, pushOverlayEntry } from "./overlayHistory";

type Options = {
  /**
   * Set by overlays that close *because* they are navigating (the search
   * overlay closing on a result tap). Teardown then leaves the router's new
   * history entry alone instead of popping it back off.
   */
  navigatingRef?: RefObject<boolean>;
};

/**
 * Make the phone's back gesture close an overlay instead of leaving the page.
 *
 * On a touch device the back gesture is the only dismiss affordance a user has
 * — Escape is keyboard-only, and reaching for a small × in a corner is not what
 * anyone does first. Every full-screen surface therefore pushes a sentinel
 * history entry while it is open, so back pops the sentinel (dismissing the
 * overlay) rather than navigating the page away underneath it.
 *
 * The sentinel is popped again on teardown, but only when it is still the
 * current entry — a real popstate has already consumed it — so this never eats
 * an unrelated history entry. See overlayHistory.ts.
 */
export function useBackDismiss(
  open: boolean,
  onClose: (() => void) | undefined,
  { navigatingRef }: Options = {},
): void {
  useEffect(() => {
    if (!open || !onClose) return undefined;
    if (typeof window === "undefined") return undefined;

    if (navigatingRef) navigatingRef.current = false;
    pushOverlayEntry(window.history);

    function handlePopState() {
      onClose?.();
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      popOverlayEntry(window.history, { navigating: navigatingRef?.current ?? false });
    };
  }, [open, onClose, navigatingRef]);
}
