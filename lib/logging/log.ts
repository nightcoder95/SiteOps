export function logError(requestId: string, error: unknown, context?: unknown) {
  console.error(
    JSON.stringify({
      level: "error",
      requestId,
      timestamp: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context,
    })
  );
}

export function logInfo(requestId: string, message: string, data?: unknown) {
  console.log(
    JSON.stringify({
      level: "info",
      requestId,
      timestamp: new Date().toISOString(),
      message,
      data,
    })
  );
}

export function logWarn(requestId: string, message: string, data?: unknown) {
  console.warn(
    JSON.stringify({
      level: "warn",
      requestId,
      timestamp: new Date().toISOString(),
      message,
      data,
    })
  );
}
