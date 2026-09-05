"use client";

import { useEffect } from "react";

import { readStack, recordVisit, writeStack } from "./navStack";

/**
 * Keep the per-tab route stack in step with the current pathname.
 *
 * Mounted once, in the app shell header. The effect is idempotent for a repeat
 * of the current entry, so React's development double-invoke — and any
 * query-only rerender — leaves the recorded depth alone.
 */
export function useNavStack(pathname: string): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storage = window.sessionStorage;
    writeStack(storage, recordVisit(readStack(storage), pathname));
  }, [pathname]);
}
