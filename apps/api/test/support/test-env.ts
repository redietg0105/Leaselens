/**
 * Runs before every test file. Prisma Client loads apps/api/.env when it is imported, which would let a
 * developer's local settings (e.g. DEMO_MODE="on" while trying the app) change test results. Values set
 * here win, because .env loading never overrides a variable that is already set. Tests that need demo
 * mode turn it on themselves (demo-mode.e2e.spec.ts).
 */
process.env.DEMO_MODE = 'off';
// Same for reviewer access: off unless a test turns it on (reviewer-access.e2e.spec.ts).
process.env.REVIEWER_ACCESS = 'off';
process.env.REVIEWER_ACCESS_CODE = '';
