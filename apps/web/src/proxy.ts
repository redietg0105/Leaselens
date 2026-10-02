import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@leaselens/shared";
import { PATHNAME_HEADER } from "@/lib/request-path";

/**
 * Optimistic check only: no session cookie → straight to /signin.
 * The real check (is the session valid, which role?) happens in requireArea() and in the API.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }
  const headers = new Headers(request.headers);
  headers.set(PATHNAME_HEADER, request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/tenant/:path*", "/staff/:path*"],
};
