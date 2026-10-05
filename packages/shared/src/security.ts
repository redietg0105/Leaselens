/**
 * The web app's Content-Security-Policy, built per request with a fresh nonce (apps/web/src/proxy.ts).
 * Scripts run only if they carry the nonce (Next.js adds it to its own) or are loaded by such a script
 * ('strict-dynamic'), so injected markup can't run code. The page may only talk to itself and the API.
 */
export function contentSecurityPolicy(opts: { nonce: string; apiOrigin: string; dev: boolean }): string {
  const { nonce, apiOrigin, dev } = opts;
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // Development: React's debugging needs eval, and hot reload uses a websocket.
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    // Next.js and the UI library set some inline styles; styles can't run code.
    'style-src': ["'self'", "'unsafe-inline'"],
    // Photos come from the API; previews of picked photos are blob: URLs.
    'img-src': ["'self'", 'blob:', 'data:', apiOrigin],
    'font-src': ["'self'"],
    'connect-src': ["'self'", apiOrigin, ...(dev ? ['ws:', 'wss:'] : [])],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  const policy = Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`);
  // Deployed over HTTPS: upgrade any stray http:// request. (Not on plain-HTTP localhost, where it would
  // break loading from the API.)
  if (!dev && apiOrigin.startsWith('https:')) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}
