import { expect, test } from "@playwright/test";

/**
 * Regression DM-R1: on the sign-in page the demo account buttons showed "Check your email" instead
 * of signing in. Drives the real web app and API in a browser: demo button → "Email me a sign-in
 * link" → "Sign in now" → the account's home page.
 *
 * Needs `npm run dev` with DEMO_MODE="on". Each run uses one of the account's 3 sign-in links per
 * 15 minutes; past that the page shows the demo-mode limit notice and this test says so.
 */
const API = process.env.E2E_API_URL ?? "http://localhost:4100";

test.beforeAll(async ({ request }) => {
  const demo = await request.get(`${API}/auth/demo`).catch(() => null);
  expect(demo?.ok(), `The API at ${API} isn't reachable — start it with npm run dev`).toBeTruthy();
  expect((await demo!.json()).enabled, 'Demo mode is off — set DEMO_MODE="on" in apps/api/.env and restart').toBe(true);
});

for (const { button, home, heading } of [
  { button: "Tenant", home: "/tenant", heading: "My requests" },
  { button: "Vendor", home: "/vendor/jobs", heading: "My jobs" },
]) {
  test(`demo "${button}" button signs in`, async ({ page }) => {
    await page.goto("/signin");
    await page.getByRole("button", { name: button, exact: true }).click();
    await expect(page.getByLabel("Email")).not.toHaveValue("");
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();

    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    const limit = page.getByText(/^Demo mode: this account already got/);
    const signInNow = page.getByRole("button", { name: "Sign in now" });
    await expect(signInNow.or(limit)).toBeVisible();
    expect(await limit.isVisible(), "This demo account hit its sign-in link limit — wait 15 minutes and run again").toBe(false);

    await signInNow.click();
    await expect(page).toHaveURL(home);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  });
}
