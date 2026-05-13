import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background:
          'radial-gradient(1200px 600px at 20% -10%, rgba(59, 130, 246, 0.16), transparent 60%), radial-gradient(1000px 500px at 120% 120%, rgba(20, 184, 166, 0.16), transparent 60%), #f3f6fc',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          borderRadius: 18,
          border: '1px solid rgba(15, 23, 42, 0.09)',
          background: '#ffffff',
          boxShadow: '0 14px 40px rgba(15, 23, 42, 0.12)',
          padding: 24,
        }}
      >
        {children}
      </div>
    </div>
  );
}
