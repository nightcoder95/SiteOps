'use client';

import { useEffect } from 'react';

import { PageStack } from '@/components/ui/page-primitives';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('App route error', error);
  }, [error]);

  return (
    <PageStack>
      <section className="rounded-3xl bg-red-500/10 p-6 text-red-300">
        <h2 className="text-lg font-bold">Something went wrong</h2>
        <p className="mt-2 text-sm">
          We hit an unexpected error loading this page.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white"
        >
          Try again
        </button>
      </section>
    </PageStack>
  );
}
