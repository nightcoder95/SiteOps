import { logInfo, logWarn } from "@/lib/logging/log";

export async function measureDbQuery<T>(
  requestId: string,
  label: string,
  query: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await query();
    const durationMs = Date.now() - startedAt;
    if (durationMs > 100) {
      logWarn(requestId, "slow_db_query", { label, durationMs });
    } else {
      logInfo(requestId, "db_query", { label, durationMs });
    }
    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logWarn(requestId, "db_query_failed", { label, durationMs, error: String(error) });
    throw error;
  }
}
