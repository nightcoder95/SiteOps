import { toast } from 'sonner';

import type { ClientResult } from '@/lib/http/client';
import { friendlyErrorMessage, GENERIC_ERROR_COPY } from '@/lib/ui/toastMessages';

export function toastSuccess(message: string) {
  toast.success(message);
}

// Show a friendly, code-driven error toast. Never surfaces the raw backend
// `message` (which may be a DB constraint, validation internal, or GoTrue
// string) — that stays in logs/requestId. Pass an optional override for cases
// that warrant bespoke copy.
export function notifyError(result: ClientResult<unknown>, override?: string) {
  if (result.ok) return;
  toast.error(override ?? friendlyErrorMessage(result.code));
}

// Generic error toast for non-ClientResult failures (e.g. raw thrown errors,
// Supabase auth errors). Keeps system text out of the UI.
export function notifyGenericError(override?: string) {
  toast.error(override ?? GENERIC_ERROR_COPY);
}

// Deprecated: surfaced raw backend strings. Retained as a thin alias over
// notifyError so existing imports keep compiling; prefer notifyError directly.
export function toastClientError(result: ClientResult<unknown>) {
  notifyError(result);
}
