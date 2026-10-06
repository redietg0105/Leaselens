import { defineConfig } from "@playwright/test";

/**
 * Browser tests against the running app (`npm run dev` with DEMO_MODE="on" in apps/api/.env).
 * Run with `npm run test:e2e`. Uses the Edge already installed on Windows — no browser download.
 * Not part of `npm run check`, which runs offline without a database.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_WEB_URL ?? "http://localhost:3000",
    channel: "msedge",
    viewport: { width: 390, height: 844 },
  },
});
