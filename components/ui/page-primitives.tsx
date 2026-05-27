'use client';

import { AlertCircle } from 'lucide-react';

// ApiUnavailableBanner is the canonical implementation in
// `components/ui/ApiUnavailableBanner.tsx` — re-exported here for the
// historical import path. Two divergent copies caused theme clashes.
export { ApiUnavailableBanner } from '@/components/ui/ApiUnavailableBanner';

export function SimpleCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`card-standard p-5 ${className}`}>{children}</div>;
}

export function PageHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-1 mb-8">
      <h2 className="text-2xl font-extrabold tracking-tight text-white uppercase">{title}</h2>
      {subtitle && <p className="text-sm text-slate-500 font-medium italic mt-1.5">{subtitle}</p>}
    </div>
  );
}

export function EmptyState({ message = 'No data found.' }: { message?: string }) {
  return (
    <div className="text-center py-24 bg-white/2 rounded-3xl border border-dashed border-white/5 backdrop-blur-sm">
      <AlertCircle className="w-12 h-12 text-slate-700 mx-auto mb-4" />
      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest italic">{message}</p>
    </div>
  );
}

export function PageStack({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex flex-col gap-6 pb-20 ${className}`}>{children}</div>;
}

export function PageHero({
  children,
  className = '',
  eyebrow,
  title,
  description,
}: {
  children?: React.ReactNode;
  className?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
}) {
  return (
    <div className={`rounded-3xl bg-gradient-to-br from-sky-500/10 to-slate-900/60 border border-sky-500/10 p-6 backdrop-blur-md ${className}`}>
      {eyebrow && <p className="text-[9px] font-bold uppercase tracking-widest text-sky-400 mb-2">{eyebrow}</p>}
      {title && <h2 className="text-2xl font-extrabold tracking-tight text-white uppercase mb-1">{title}</h2>}
      {description && <p className="text-sm text-slate-500 font-medium italic">{description}</p>}
      {children}
    </div>
  );
}
