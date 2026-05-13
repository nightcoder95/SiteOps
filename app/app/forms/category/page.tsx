import { Suspense } from 'react';

import { CategoryStepClient } from '@/app/app/forms/category/CategoryStepClient';

export default function CategoryPage() {
  return (
    <Suspense fallback={<div className="rounded-3xl border border-outline-variant bg-surface px-4 py-6 text-sm font-medium text-on-surface-variant">Loading category step...</div>}>
      <CategoryStepClient />
    </Suspense>
  );
}
