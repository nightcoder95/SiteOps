"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

import { pathnameOf, readStack, recordReplace, writeStack } from "./navStack";

/**
 * next/navigation's router with replace() taught to keep the route stack in
 * step — see navStack.ts for why the up-chevron needs that stack to be exact.
 *
 * Use this instead of useRouter() anywhere a replacing navigation changes the
 * pathname. Everything else is passed straight through.
 */
export function useNavRouter() {
  const router = useRouter();

  const replace = useCallback(
    (href: string) => {
      if (typeof window !== "undefined") {
        const storage = window.sessionStorage;
        writeStack(storage, recordReplace(readStack(storage), pathnameOf(href)));
      }
      router.replace(href);
    },
    [router],
  );

  // Delegate rather than hand out the router's own function references, so the
  // wrapper cannot break if those ever stop being standalone closures.
  return useMemo(
    () => ({
      replace,
      push: (href: string) => router.push(href),
      back: () => router.back(),
      forward: () => router.forward(),
      refresh: () => router.refresh(),
      prefetch: (href: string) => router.prefetch(href),
    }),
    [router, replace],
  );
}
