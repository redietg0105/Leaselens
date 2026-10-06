import { expect, test, type Page } from "@playwright/test";

/**
 * Regression B-10: a field error stayed after the value was fixed ("at least 10 characters" on New
 * request). Drives the real forms: once an error shows, fixing the value removes the message and the
 * field's aria-invalid while typing, without submitting again.
 *
 * Needs `npm run dev` with DEMO_MODE="on". Uses one Tenant sign-in link per run (3 per 15 minutes) and
 * never sends a request, so no data is created.
 */
const API = process.env.E2E_API_URL ?? "http://localhost:4100";

test.beforeAll(async ({ request }) => {
  const demo = await request.get(`${API}/auth/demo`).catch(() => null);
  expect(demo?.ok(), `The API at ${API} isn't reachable — start it first`).toBeTruthy();
  expect((await demo!.json()).enabled, 'Demo mode is off — set DEMO_MODE="on" in apps/api/.env and restart').toBe(true);
});

async function signInAsTenant(page: Page) {
  await page.goto("/signin");
  await page.getByRole("button", { name: "Tenant", exact: true }).click();
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  const limit = page.getByText(/^Demo mode: this account already got/);
  const signInNow = page.getByRole("button", { name: "Sign in now" });
  await expect(signInNow.or(limit)).toBeVisible();
  expect(await limit.isVisible(), "The Tenant account hit its sign-in link limit — wait 15 minutes").toBe(false);
  await signInNow.click();
  await expect(page).toHaveURL("/tenant");
}

test("sign-in: the email error clears once the address is valid", async ({ page }) => {
  await page.goto("/signin");
  const email = page.getByLabel("Email");
  await email.fill("not-an-email");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  const error = page.getByText("Enter a valid email address.");
  await expect(error).toBeVisible();
  await expect(email).toHaveAttribute("aria-invalid", "true");

  await email.fill("tenant@leaselens");
  await expect(error).toBeVisible(); // still invalid
  await email.pressSequentially(".test");
  await expect(error).toBeHidden();
  await expect(email).toHaveAttribute("aria-invalid", "false");
});

test("new request: errors clear as each field is fixed", async ({ page }) => {
  await signInAsTenant(page);
  await page.goto("/tenant/requests/new");
  const description = page.getByLabel("What's the problem?");
  const notes = page.getByLabel(/Access notes/);

  await description.fill("leak");
  await notes.fill("x".repeat(501));
  await page.getByRole("button", { name: "Send request" }).click();
  const tooShort = page.getByText(/at least 10 characters/);
  const permission = page.getByText("Choose whether we may enter.");
  const notesError = page.locator("#accessNotes-error");
  await expect(tooShort).toBeVisible();
  await expect(permission).toBeVisible();
  await expect(notesError).toBeVisible();
  await expect(description).toHaveAttribute("aria-invalid", "true");

  // Typing a valid description removes only its error, straight away.
  await description.pressSequentially(" under the kitchen sink");
  await expect(tooShort).toBeHidden();
  await expect(description).toHaveAttribute("aria-invalid", "false");
  await expect(permission).toBeVisible();

  await notes.fill("x".repeat(500));
  await expect(notesError).toBeHidden();
  await expect(notes).toHaveAttribute("aria-invalid", "false");

  await page.getByLabel("Yes, you may enter").check();
  await expect(permission).toBeHidden();
  // Nothing is sent: the request is never submitted with valid values.
});
