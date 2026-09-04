import { describe, expect, it } from "vitest";

import { createScrollLock } from "./scrollLock";

// A naive "set overflow:hidden on open, clear it on close" breaks the moment two
// overlays are open at once: the inner one's cleanup restores scrolling while
// the outer one is still covering the page. The lock is therefore ref-counted.
function fakeBody() {
  return { style: { overflow: "" } } as HTMLElement;
}

describe("createScrollLock", () => {
  it("locks the body while an overlay is open", () => {
    const body = fakeBody();
    const lock = createScrollLock(() => body);

    lock();
    expect(body.style.overflow).toBe("hidden");
  });

  it("restores the original overflow when the last overlay closes", () => {
    const body = fakeBody();
    body.style.overflow = "auto";
    const lock = createScrollLock(() => body);

    const release = lock();
    release();

    expect(body.style.overflow).toBe("auto");
  });

  it("keeps the lock while an outer overlay is still open", () => {
    const body = fakeBody();
    const lock = createScrollLock(() => body);

    const releaseOuter = lock();
    const releaseInner = lock();

    releaseInner();
    expect(body.style.overflow).toBe("hidden");

    releaseOuter();
    expect(body.style.overflow).toBe("");
  });

  it("ignores a double release rather than unlocking someone else's overlay", () => {
    const body = fakeBody();
    const lock = createScrollLock(() => body);

    const releaseOuter = lock();
    const releaseInner = lock();

    releaseInner();
    releaseInner();
    expect(body.style.overflow).toBe("hidden");

    releaseOuter();
    expect(body.style.overflow).toBe("");
  });

  it("is a no-op when there is no document (server render)", () => {
    const lock = createScrollLock(() => null);
    expect(() => lock()()).not.toThrow();
  });
});
