import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';

export const REQUEST_ID_HEADER = 'x-request-id';

/** A caller may pass its own request id (e.g. from a proxy), but only a short, safe one. */
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Never log credentials. Session cookies, Set-Cookie and Authorization headers are replaced with
 * "[Redacted]" wherever they appear in a log line.
 */
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  'headers.cookie',
  'headers.authorization',
];

export function requestIdFor(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id = typeof incoming === 'string' && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

/** Structured JSON logs (pretty in development), one line per request, with a request id. */
export function loggerParams(env: NodeJS.ProcessEnv = process.env): Params {
  const isTest = env.NODE_ENV === 'test';
  const isProd = env.NODE_ENV === 'production';
  return {
    pinoHttp: {
      level: isTest ? 'silent' : (env.LOG_LEVEL ?? 'info'),
      genReqId: requestIdFor,
      redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
      // Keep request logs short: method, path and id are enough to trace a problem.
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      autoLogging: { ignore: (req) => req.url === '/health' },
      transport: isProd || isTest ? undefined : { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' } },
    },
  };
}
