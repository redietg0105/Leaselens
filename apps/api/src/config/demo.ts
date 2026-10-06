/**
 * Demo mode (local only): the sign-in link is returned to the browser instead of only being printed in
 * the API terminal, and the sign-in page offers the seeded demo accounts. Never on in production —
 * checked here on every use, and the API refuses to start with DEMO_MODE="on" in production or with a
 * public WEB_URL (in case NODE_ENV was left unset on a server). Each request must also come from a
 * local address (see isLocalAddress), so a dev machine reachable from the internet hands out no links.
 */
export function isDemoMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DEMO_MODE === 'on' && env.NODE_ENV !== 'production' && isLocalWebUrl(env.WEB_URL);
}

/** Demo mode is on and this request comes from this machine or the local network. */
export function isDemoRequest(clientAddress: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  return isDemoMode(env) && isLocalAddress(clientAddress);
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
  return host === 'localhost' || isLocalAddress(host.replace(/^\[|\]$/g, ''));
}

/**
 * The client's address (Express req.ip — the socket address, or the visitor's address when TRUST_PROXY
 * is set) is loopback or a private / link-local network. Node reports IPv4 clients on a dual-stack
 * socket as "::ffff:127.0.0.1", so the IPv4-mapped form is unwrapped first.
 */
export function isLocalAddress(address: string | undefined): boolean {
  if (!address) return false;
  const a = address.toLowerCase().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(a)) {
    const [p, q] = a.split('.').map(Number);
    if (a.split('.').some((n) => +n > 255)) return false;
    return p === 127 || p === 10 || (p === 172 && q >= 16 && q <= 31) || (p === 192 && q === 168) || (p === 169 && q === 254);
  }
  if (!a.includes(':')) return false;
  // IPv6: loopback, unique local (fc00::/7), link-local (fe80::/10)
  return a === '::1' || /^f[cd][0-9a-f]{2}:/.test(a) || /^fe[89ab][0-9a-f]:/.test(a);
}
