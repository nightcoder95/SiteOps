'use client';

import { useEffect } from 'react';

import { PageStack } from '@/components/ui/page-primitives';

export default function SiteDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('Site detail error', error);
  }, [error]);

  return (
    <PageStack>
      <section className="rounded-3xl bg-red-500/10 p-6 text-red-300">
        <h2 className="text-lg font-bold">Couldn&apos;t load site</h2>
        <p className="mt-2 text-sm">
          The site detail failed to load. Try again or go back to the site list.
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
