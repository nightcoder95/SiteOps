import { WifiOff } from 'lucide-react';

// Single source of truth for the API/endpoint-unavailable banner. Dark theme
// to match the app shell; props remain optional so callers can pass either
// an explicit message or just an endpoint/method pair.
export function ApiUnavailableBanner({
  endpoint,
  method,
  message,
}: {
  endpoint?: string;
  method?: string;
  message?: string;
}) {
  const text =
    message ??
    `Service connection unstable${endpoint ? ` — ${method?.toUpperCase() ?? 'GET'} ${endpoint}` : ''}. Offline updates will sync upon reconnection.`;
  return (
    <div className="bg-amber-500/10 border border-amber-500/20 py-3 px-4 flex items-center justify-center gap-2 backdrop-blur-md rounded-xl">
      <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">{text}</span>
    </div>
  );
}
