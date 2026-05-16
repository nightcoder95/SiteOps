import type { NextRequest } from "next/server";

import { AUTH_USER_ID_HEADER } from "@/lib/auth/headers";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse } from "@/lib/errors/response";
import { upstashRateLimit } from "@/lib/rateLimit/upstash";

// Returns a 429 Response when the request exceeds the limit, else null.
// Key: prefer userId (set by middleware via AUTH_USER_ID_HEADER) so shared IPs aren't
// penalised and authenticated users can't bypass by rotating IPs. Falls back to IP.
export async function applyRateLimit(
  request: NextRequest,
  requestId: string
): Promise<Response | null> {
  // Skip in non-production to avoid Upstash REST RTT on the local dev loop.
  if (process.env.NODE_ENV !== "production") return null;
  if (!upstashRateLimit) return null;

  const pathname = new URL(request.url).pathname;
  const userId = request.headers.get(AUTH_USER_ID_HEADER);
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = userId ? `user:${userId}:${pathname}` : `ip:${ip}:${pathname}`;

  const result = await upstashRateLimit.limit(key);
  if (result.success) return null;

  return errorResponse(
    ERROR_CODES.RATE_LIMITED,
    "Too many requests",
    429,
    { limit: result.limit, remaining: result.remaining, reset: result.reset },
    requestId
  );
}
