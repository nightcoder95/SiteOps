import { toast } from 'sonner';

import type { ClientResult } from '@/lib/http/client';

export function toastSuccess(message: string) {
  toast.success(message);
}

export function toastClientError(result: ClientResult<unknown>) {
  if (result.ok) return;
  if (result.kind === 'endpoint_unavailable') {
    toast.error(`Endpoint unavailable: ${result.method} ${result.endpoint}`);
    return;
  }
  toast.error(result.message);
}
