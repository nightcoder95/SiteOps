import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

import { getSupabaseUrl, getSupabaseAnonKey } from "@/lib/auth/config";
import { PUBLIC_ROUTES } from "@/lib/auth/constants";
import { ERROR_CODES } from "@/lib/errors/codes";
import { upstashRateLimit } from "@/lib/rateLimit/upstash";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  let response = NextResponse.next({ request });

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (PUBLIC_ROUTES.includes(pathname)) {
    return response;
  }

  if (pathname.startsWith("/api") && upstashRateLimit) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    // Key by userId when authenticated so shared IPs aren't penalised,
    // and authenticated users can't bypass limits by rotating IPs.
    const limitKey = user
      ? `user:${user.id}:${pathname}`
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

  if (!user) {
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
