import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/auth/config";
import {
  AUTH_USER_EMAIL_HEADER,
  AUTH_USER_ID_HEADER,
  AUTH_USER_ROLE_HEADER,
  parseSessionRole,
} from "@/lib/auth/headers";
import { PUBLIC_ROUTES } from "@/lib/auth/constants";
import { ERROR_CODES } from "@/lib/errors/codes";
import { upstashRateLimit } from "@/lib/rateLimit/upstash";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const requestHeaders = new Headers(request.headers);
  const cookiesToSet: Array<{
    name: string;
    value: string;
    options?: Parameters<NextResponse["cookies"]["set"]>[2];
  }> = [];

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(nextCookiesToSet) {
        nextCookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        nextCookiesToSet.forEach(({ name, value, options }) => {
          cookiesToSet.push({ name, value, options });
        });
      },
    },
  });
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsError ? null : claimsData?.claims ?? null;
  let userId = typeof claims?.sub === "string" ? claims.sub : null;
  let userEmail = typeof claims?.email === "string" ? claims.email : "";
  const userRole = parseSessionRole(
    typeof claims?.user_role === "string"
      ? claims.user_role
      : typeof claims?.role === "string"
        ? claims.role
      : null
  );

  if (!userId && claimsError) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    userEmail = user?.email ?? "";
  }

  if (userId) {
    requestHeaders.set(AUTH_USER_ID_HEADER, userId);
    requestHeaders.set(AUTH_USER_EMAIL_HEADER, userEmail);
    if (userRole) {
      requestHeaders.set(AUTH_USER_ROLE_HEADER, userRole);
    } else {
      requestHeaders.delete(AUTH_USER_ROLE_HEADER);
    }
  } else {
    requestHeaders.delete(AUTH_USER_ID_HEADER);
    requestHeaders.delete(AUTH_USER_EMAIL_HEADER);
    requestHeaders.delete(AUTH_USER_ROLE_HEADER);
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  if (PUBLIC_ROUTES.includes(pathname)) {
    return response;
  }

  if (pathname.startsWith("/api") && upstashRateLimit) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    // Key by userId when authenticated so shared IPs aren't penalised,
    // and authenticated users can't bypass limits by rotating IPs.
    const limitKey = userId
      ? `user:${userId}:${pathname}`
      : `ip:${ip}:${pathname}`;
    const result = await upstashRateLimit.limit(limitKey);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.RATE_LIMITED,
            message: "Too many requests",
            details: { limit: result.limit, remaining: result.remaining, reset: result.reset },
          },
          meta: {
            requestId: null,
            timestamp: new Date().toISOString(),
          },
        },
        { status: 429 }
      );
    }
  }

  if (!userId) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required",
          },
          meta: {
            requestId: null,
            timestamp: new Date().toISOString(),
          },
        },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL("/auth/sign-in", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
