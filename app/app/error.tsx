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
      <section className="rounded-3xl bg-error-container p-6 text-on-error-container">
        <h2 className="font-headline-sm text-headline-sm">Something went wrong</h2>
        <p className="mt-2 font-body-md text-body-md">
          We hit an unexpected error loading this page.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-full bg-error px-4 py-2 font-label-lg text-label-lg text-on-error"
        >
          Try again
        </button>
      </section>
    </PageStack>
  );
}
