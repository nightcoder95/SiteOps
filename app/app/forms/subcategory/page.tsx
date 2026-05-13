import { Suspense } from 'react';

import { SubcategoryStepClient } from '@/app/app/forms/subcategory/SubcategoryStepClient';

export default function SubcategoryPage() {
  return (
    <Suspense fallback={<div className="rounded-3xl border border-outline-variant bg-surface px-4 py-6 text-sm font-medium text-on-surface-variant">Loading subcategory step...</div>}>
      <SubcategoryStepClient />
    </Suspense>
  );
}
