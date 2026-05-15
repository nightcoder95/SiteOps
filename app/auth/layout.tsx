import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-margin-mobile md:p-margin-desktop font-body-lg text-body-lg">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
        {children}
      </div>
    </div>
  );
}
