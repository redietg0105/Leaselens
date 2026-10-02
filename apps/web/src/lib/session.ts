import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { homePathForRole, MeSchema, SESSION_COOKIE, type Me } from "@leaselens/shared";
import type { z } from "zod";
import { apiUrl } from "./api";

async function sessionCookieHeader(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? `${SESSION_COOKIE}=${encodeURIComponent(token)}` : null;
}

/**
 * Server-side: who is signed in? Asks the API (which checks the session in the database) and
 * forwards the session cookie. The browser sends the cookie to port 3000 too because cookies
 * are not scoped by port. Cached per request.
 */
export const getCurrentUser = cache(async (): Promise<Me | null> => {
  const cookie = await sessionCookieHeader();
  if (!cookie) return null;

  const res = await fetch(apiUrl("/me"), { headers: { cookie }, cache: "no-store" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /me failed with ${res.status}`);
  return MeSchema.parse(await res.json());
});

/**
 * Use at the top of every protected page (not only in layouts — layouts don't re-run on
 * client navigation). Not signed in → /signin. Wrong area → the user's own area.
 * The API still enforces roles on every endpoint; this only decides which page to show.
 */
export async function requireArea(area: "/tenant" | "/staff"): Promise<Me> {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  const home = homePathForRole(user.role);
  if (home !== area) redirect(home);
  return user;
}

/** Tenant-only pages. Vendors share the /tenant area but go back to its home. */
export async function requireTenant(): Promise<Me> {
  const user = await requireArea("/tenant");
  if (user.role !== "TENANT") redirect("/tenant");
  return user;
}

/**
 * Server-side GET to the API with the user's session, validated with a shared Zod schema.
 * 401 → /signin, 404 → the nearest not-found page, anything else → the nearest error boundary.
 */
export async function apiGet<S extends z.ZodType>(path: string, schema: S): Promise<z.output<S>> {
  const cookie = await sessionCookieHeader();
  if (!cookie) redirect("/signin");

  const res = await fetch(apiUrl(path), { headers: { cookie }, cache: "no-store" });
  if (res.status === 401) redirect("/signin");
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`GET ${path} failed with ${res.status}`);
  return schema.parse(await res.json());
}
