import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, SESSION_COOKIE } from "@leaselens/shared";
import { API_URL } from "@/lib/api";
import { PATHNAME_HEADER } from "@/lib/request-path";

const PROTECTED = /^\/(tenant|vendor|staff)(\/|$)/;

/**
 * Runs before every page:
 * - Sets a Content-Security-Policy with a fresh nonce. Next.js reads it from the request headers and
 *   adds the nonce to its own scripts (pages render per request, see the root layout).
 * - Protected areas: optimistic check only — no session cookie → straight to /signin. The real check
 *   (is the session valid, which role?) happens in requireArea() and in the API.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PROTECTED.test(pathname) && !request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy({
    nonce,
    // Deployed, the API is reached through /api on this origin ("self"); locally it is another origin.
    apiOrigin: API_URL.startsWith("/") ? null : new URL(API_URL).origin,
    dev: process.env.NODE_ENV !== "production",
  });
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  headers.set(PATHNAME_HEADER, pathname + search);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Every page, but not static files or prefetches (they don't render HTML).
  matcher: [
    {
      // Not /api/*: those requests are forwarded to the API untouched (running this on them would make
      // Next.js buffer upload bodies, with a 10 MB limit).
      source: "/((?!api(?:/|$)|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
