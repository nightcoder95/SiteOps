import { AlertTriangle } from 'lucide-react';

export function ApiUnavailableBanner({ endpoint, method }: { endpoint: string; method: string }) {
  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-amber-950 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-amber-100 p-2 text-amber-700">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Endpoint unavailable</p>
          <p className="text-sm text-amber-900/80">
            {method.toUpperCase()} {endpoint} is not available on this build.
          </p>
        </div>
      </div>
    </div>
  );
}
