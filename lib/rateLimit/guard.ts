import type { NextRequest } from "next/server";

import { AUTH_USER_ID_HEADER } from "@/lib/auth/headers";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse } from "@/lib/errors/response";
import { upstashGlobalRateLimit, upstashRateLimit } from "@/lib/rateLimit/upstash";

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
  // x-forwarded-for is platform-set on Vercel (the platform overwrites it), so
  // the first entry is trustworthy there. If this app is ever self-hosted behind
  // a proxy that APPENDS instead, a client can spoof this value and evade the
  // unauthenticated bucket — revisit the key derivation then.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const identityKey = userId ? `user:${userId}` : `ip:${ip}`;
  const key = `${identityKey}:${pathname}`;

  // Both buckets must pass. Evaluated in parallel — two Upstash calls cost about
  // the same wall time as one, and the shared ephemeral cache short-circuits an
  // already-blocked identifier without any network at all.
  const [perPath, global] = await Promise.all([
    upstashRateLimit.limit(key),
    upstashGlobalRateLimit ? upstashGlobalRateLimit.limit(identityKey) : null,
  ]);
  if (perPath.success && (global === null || global.success)) return null;

  const failed = perPath.success ? global! : perPath;
  return errorResponse(
    ERROR_CODES.RATE_LIMITED,
    "Too many requests",
    429,
    { limit: failed.limit, remaining: failed.remaining, reset: failed.reset },
    requestId
  );
}
