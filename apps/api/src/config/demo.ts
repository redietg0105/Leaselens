/**
 * Demo mode (local only): the sign-in link is returned to the browser instead of only being printed in
 * the API terminal, and the sign-in page offers the seeded demo accounts. Never on in production —
 * checked here on every use, and the API refuses to start with DEMO_MODE="on" in production.
 */
export function isDemoMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DEMO_MODE === 'on' && env.NODE_ENV !== 'production';
}
