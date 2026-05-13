import { Suspense } from 'react';

import { NewEntryStepClient } from '@/app/app/forms/new/NewEntryStepClient';

export default function NewEntryPage() {
  return (
    <Suspense fallback={<div className="rounded-3xl border border-outline-variant bg-surface px-4 py-6 text-sm font-medium text-on-surface-variant">Loading entry step...</div>}>
      <NewEntryStepClient />
    </Suspense>
  );
}
