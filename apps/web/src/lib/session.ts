import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  areaForRole,
  homePathForRole,
  MeSchema,
  safeReturnPath,
  SESSION_COOKIE,
  type Area,
  type Me,
  type Role,
} from "@leaselens/shared";
import type { z } from "zod";
import { PATHNAME_HEADER } from "./request-path";
import { apiUrl } from "./api";

async function sessionCookieHeader(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? `${SESSION_COOKIE}=${encodeURIComponent(token)}` : null;
}

/**
 * fetch() to the API from the server. If the API can't be reached at all (still starting, restarting
 * or down), go to /unavailable, which reconnects and brings the user back — instead of throwing an
 * unhandled "fetch failed" error.
 */
async function apiFetch(path: string, cookie: string): Promise<Response> {
  try {
    return await fetch(apiUrl(path), { headers: { cookie }, cache: "no-store" });
  } catch {
    const here = safeReturnPath((await headers()).get(PATHNAME_HEADER), "/");
    redirect(`/unavailable?next=${encodeURIComponent(here)}`);
  }
}

/**
 * Server-side: who is signed in? Asks the API (which checks the session in the database) and
 * forwards the session cookie. The browser sends the cookie to port 3000 too because cookies
 * are not scoped by port. Cached per request.
 */
export const getCurrentUser = cache(async (): Promise<Me | null> => {
  const cookie = await sessionCookieHeader();
  if (!cookie) return null;

  const res = await apiFetch("/me", cookie);
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /me failed with ${res.status}`);
  return MeSchema.parse(await res.json());
});

/**
 * Use at the top of every protected page (not only in layouts — layouts don't re-run on
 * client navigation). Not signed in → /signin. Wrong area → the user's own area.
 * The API still enforces roles on every endpoint; this only decides which page to show.
 */
export async function requireArea(area: Area): Promise<Me> {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  // A vendor opening /tenant goes to /vendor/jobs, a tenant opening /vendor goes to /tenant, etc.
  if (areaForRole(user.role) !== area) redirect(homePathForRole(user.role));
  return user;
}

/**
 * For area layouts: send a signed-in user who is in the wrong area to their own home right away
 * (a server redirect before anything renders). Pages still call requireArea() themselves.
 */
export async function redirectIfWrongArea(area: Area): Promise<Me | null> {
  const user = await getCurrentUser();
  if (user && areaForRole(user.role) !== area) redirect(homePathForRole(user.role));
  return user;
}

/** Tenant pages (only tenants have the /tenant area). */
export const requireTenant = () => requireArea("/tenant");

/** Pages for some roles within an area (e.g. the staff queue is for coordinators and managers). */
export async function requireRoles(area: Area, roles: Role[]): Promise<Me | null> {
  const user = await requireArea(area);
  return roles.includes(user.role) ? user : null;
}

/**
 * Server-side GET to the API with the user's session, validated with a shared Zod schema.
 * 401 → /signin, 404 → the nearest not-found page, API unreachable → /unavailable,
 * anything else → the nearest error boundary.
 */
export async function apiGet<S extends z.ZodType>(path: string, schema: S): Promise<z.output<S>> {
  const cookie = await sessionCookieHeader();
  if (!cookie) redirect("/signin");

  const res = await apiFetch(path, cookie);
  if (res.status === 401) redirect("/signin");
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`GET ${path} failed with ${res.status}`);
  return schema.parse(await res.json());
}
