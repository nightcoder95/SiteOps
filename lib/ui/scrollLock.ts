// Ref-counted body scroll lock for overlays.
//
// Overlays stack: a confirm dialog opens over a modal, a rename modal over a
// drawer. A naive lock that clears `overflow` on close would restore scrolling
// as soon as the *inner* overlay closed, leaving the page behind the outer one
// scrollable. Counting open overlays and only restoring on the last release is
// what makes stacking safe.
//
// The body getter is injected so the counter can be unit-tested without a DOM.
export function createScrollLock(getBody: () => HTMLElement | null) {
  let depth = 0;
  let previousOverflow = "";

  return function lock(): () => void {
    const body = getBody();
    if (!body) return () => {};

    if (depth === 0) {
      previousOverflow = body.style.overflow;
      body.style.overflow = "hidden";
    }
    depth += 1;

    let released = false;
    return function release() {
      // Guard against a double release (React can invoke a cleanup twice in
      // StrictMode); without it, one overlay could unlock the page for another.
      if (released) return;
      released = true;
      depth -= 1;
      if (depth === 0) body.style.overflow = previousOverflow;
    };
  };
}

export const lockBodyScroll = createScrollLock(() =>
  typeof document === "undefined" ? null : document.body,
);
