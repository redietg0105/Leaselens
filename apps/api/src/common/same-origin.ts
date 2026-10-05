import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const CROSS_SITE_MESSAGE = 'This request was blocked because it did not come from the LeaseLens website.';

/**
 * CSRF defence in depth (the session cookie is already SameSite=Lax). A request that changes data is
 * refused when the browser says it came from another site: an Origin header other than the web app's,
 * or Sec-Fetch-Site: cross-site. Requests without these headers (curl, server-to-server, tests) are
 * allowed — they can't carry a user's cookies from a browser anyway.
 */
export function sameOriginWrites(webUrl: string) {
  const allowed = new URL(webUrl).origin;
  return (req: Request, res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.headers.origin;
    const fetchSite = req.headers['sec-fetch-site'];
    if ((origin !== undefined && origin !== allowed) || fetchSite === 'cross-site') {
      const requestId = randomUUID();
      res.setHeader('X-Request-Id', requestId);
      res.status(403).json({ statusCode: 403, message: CROSS_SITE_MESSAGE, requestId });
      return;
    }
    next();
  };
}
