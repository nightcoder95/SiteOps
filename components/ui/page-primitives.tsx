import type { ReactNode } from 'react';

export function PageStack({ children }: { children: ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}

export function PageHero({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-[2rem] border border-outline-variant/40 bg-white p-6 shadow-[0_3px_12px_rgba(15,23,42,0.06)]">
      <p className="text-[10px] font-black uppercase tracking-[0.35em] text-on-surface-variant">{eyebrow}</p>
      <h2 className="mt-2 font-headline text-5xl font-black uppercase leading-[0.95] tracking-tight text-on-surface">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm font-medium text-on-surface-variant">{description}</p>
    </section>
  );
}

export function SectionCard({ children }: { children: ReactNode }) {
  return <section className="rounded-[1.75rem] border border-outline-variant bg-surface p-4 shadow-sm">{children}</section>;
}

export function CountPill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-surface-container-low px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em] text-on-surface-variant">
      {children}
    </span>
  );
}
