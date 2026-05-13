import { logError } from "@/lib/logging/log";

export function runNonCritical(
  requestId: string,
  event: string,
  task: Promise<unknown>,
  context?: Record<string, unknown>
) {
  task.catch((error) => {
    logError(requestId, error, { event, ...context });
  });
}
