import { describe, expect, it, vi } from "vitest";

import { popOverlayEntry, pushOverlayEntry, type HistoryLike } from "./overlayHistory";

function fakeHistory(initial: unknown = null) {
  const back = vi.fn();
  const history = {
    state: initial,
    pushState(state: unknown) {
      (history as { state: unknown }).state = state;
    },
    back,
  };
  return { history: history as unknown as HistoryLike, back };
}

describe("overlay history", () => {
  it("pushes a sentinel entry when the overlay opens", () => {
    const { history } = fakeHistory();
    pushOverlayEntry(history);
    expect(history.state).toEqual({ searchOverlay: true });
  });

  it("pops the sentinel when the overlay is dismissed", () => {
    const { history, back } = fakeHistory();
    pushOverlayEntry(history);
    popOverlayEntry(history, { navigating: false });
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("does not pop when a real popstate already consumed the sentinel", () => {
    const { history, back } = fakeHistory();
    pushOverlayEntry(history);
    (history as { state: unknown }).state = null; // browser back already fired
    popOverlayEntry(history, { navigating: false });
    expect(back).not.toHaveBeenCalled();
  });

  it("does not pop when the overlay closed to navigate to a search hit", () => {
    const { history, back } = fakeHistory();
    pushOverlayEntry(history);
    popOverlayEntry(history, { navigating: true });
    expect(back).not.toHaveBeenCalled();
  });
});
