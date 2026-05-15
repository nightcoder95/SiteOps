import type { ReactNode } from 'react';

export function PageStack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-density-medium">{children}</div>;
}

export function PageHero({
  eyebrow: _eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <section className="mb-2">
      <h2 className="font-headline-sm text-headline-sm text-on-surface">{title}</h2>
      {description ? (
        <p className="font-body-md text-body-md text-on-surface-variant mt-1">{description}</p>
      ) : null}
    </section>
  );
}

export function SectionCard({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
      {children}
    </section>
  );
}

export function CountPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-surface-container px-2 py-1 text-label-md text-on-surface-variant">
      {children}
    </span>
  );
}
