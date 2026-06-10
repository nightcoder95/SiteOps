import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/auth/config";
import {
  AUTH_USER_EMAIL_HEADER,
  AUTH_USER_ID_HEADER,
  AUTH_USER_ROLE_HEADER,
  parseSessionRole,
} from "@/lib/auth/headers";
import { PUBLIC_ROUTES, PUBLIC_ROUTE_PREFIXES } from "@/lib/auth/constants";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Public route prefixes skip all auth work — no Supabase client, no JWT verify.
  if (PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // CORS/health preflights never carry meaningful auth state.
  if (request.method === "OPTIONS") {
    return NextResponse.next();
  }

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

  // getClaims verifies the JWT locally against the JWKS (cached). With asymmetric
  // signing keys (ES256/RS256) this avoids the Auth-server round-trip getUser() makes.
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsError ? null : claimsData?.claims ?? null;
  const userId = typeof claims?.sub === "string" ? claims.sub : null;
  const userEmail = typeof claims?.email === "string" ? claims.email : "";
  const userRole = parseSessionRole(
    typeof claims?.user_role === "string"
      ? claims.user_role
      : typeof claims?.role === "string"
        ? claims.role
        : null
  );
  // Injected by the custom_access_token hook. O(1) claim decode — no DB lookup.
  const mustChangePassword = claims?.must_change_password === true;

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

  // Force a password change for provisioned accounts still carrying the
  // must_change_password claim. Excludes the change-password page + its API so
  // the page can load and submit (no redirect loop). After the API clears the
  // flag the client refreshes its session, dropping the claim. Sign-out lives on
  // the change-password page itself, so no separate sign-out exclusion is needed.
  if (userId && mustChangePassword) {
    const isChangePasswordPath =
      pathname === "/auth/change-password" || pathname === "/api/auth/change-password";
    if (!isChangePasswordPath) {
      if (pathname.startsWith("/api")) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "PASSWORD_CHANGE_REQUIRED",
              message: "You must change your temporary password before continuing",
            },
            meta: { requestId: null, timestamp: new Date().toISOString() },
          },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL("/auth/change-password", request.url));
    }
    return response;
  }

  // Redirect authenticated users trying to access public auth/landing routes.
  if (PUBLIC_ROUTES.includes(pathname)) {
    if (userId) {
      return NextResponse.redirect(new URL("/app/dashboard", request.url));
    }
    return response;
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
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|.*\\.png|.*\\.svg|.*\\.webp|.*\\.ico|.*\\.jpg|.*\\.jpeg).*)",
  ],
};
