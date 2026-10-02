import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { homePathForRole, MeSchema, SESSION_COOKIE, type Me } from "@leaselens/shared";
import { API_URL } from "./api";

/**
 * Server-side: who is signed in? Asks the API (which checks the session in the database) and
 * forwards the session cookie. The browser sends the cookie to port 3000 too because cookies
 * are not scoped by port. Cached per request.
 */
export const getCurrentUser = cache(async (): Promise<Me | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const res = await fetch(`${API_URL}/me`, {
    headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` },
    cache: "no-store",
  });
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
