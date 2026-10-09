/**
 * The web app's Content-Security-Policy, built per request with a fresh nonce (apps/web/src/proxy.ts).
 * Scripts run only if they carry the nonce (Next.js adds it to its own) or are loaded by such a script
 * ('strict-dynamic'), so injected markup can't run code. The page may only talk to itself and the API.
 * `apiOrigin` is null when the API is reached through /api on the same origin (the deployed setup).
 */
export function contentSecurityPolicy(opts: { nonce: string; apiOrigin: string | null; dev: boolean }): string {
  const { nonce, apiOrigin, dev } = opts;
  const api = apiOrigin ? [apiOrigin] : [];
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // Development: React's debugging needs eval, and hot reload uses a websocket.
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    // Next.js and the UI library set some inline styles; styles can't run code.
    'style-src': ["'self'", "'unsafe-inline'"],
    // Photos come from the API; previews of picked photos are blob: URLs.
    'img-src': ["'self'", 'blob:', 'data:', ...api],
    'font-src': ["'self'"],
    'connect-src': ["'self'", ...api, ...(dev ? ['ws:', 'wss:'] : [])],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  const policy = Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`);
  // Deployed over HTTPS (a same-origin API means the Cloud Run site): upgrade any stray http:// request.
  // Not on plain-HTTP localhost, where it would break loading from the API.
  if (!dev && (apiOrigin === null || apiOrigin.startsWith('https:'))) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}
