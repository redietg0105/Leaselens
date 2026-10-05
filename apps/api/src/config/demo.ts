/**
 * Demo mode (local only): the sign-in link is returned to the browser instead of only being printed in
 * the API terminal, and the sign-in page offers the seeded demo accounts. Never on in production —
 * checked here on every use, and the API refuses to start with DEMO_MODE="on" in production or with a
 * public WEB_URL (in case NODE_ENV was left unset on a server).
 */
export function isDemoMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DEMO_MODE === 'on' && env.NODE_ENV !== 'production' && isLocalWebUrl(env.WEB_URL);
}

/**
 * True for an unset WEB_URL (the localhost default), localhost, and private network addresses
 * (10.x, 172.16–31.x, 192.168.x — e.g. testing from a phone on the same Wi-Fi). Not reachable from
 * the internet, so demo links can't leak to the public.
 */
export function isLocalWebUrl(webUrl: string | undefined): boolean {
  if (!webUrl) return true;
  let host: string;
  try {
    host = new URL(webUrl).hostname;
  } catch {
    return false;
  }
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true;
  const ip = host.split('.').map(Number);
  if (ip.length !== 4 || ip.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return ip[0] === 10 || (ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31) || (ip[0] === 192 && ip[1] === 168);
}
