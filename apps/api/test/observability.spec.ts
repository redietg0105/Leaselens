/**
 * Request ids, log redaction and the startup configuration check.
 */
import { Writable } from 'node:stream';
import pino from 'pino';
import request from 'supertest';
import { checkEnv } from '../src/config/env';
import { loggerParams, REDACT_PATHS } from '../src/logging/logging';
import { createTestApp, type TestApp } from './support/test-app';

describe('request ids', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });
  const http = () => request(t.app.getHttpServer());

  it('every response has an X-Request-Id header', async () => {
    const res = await http().get('/health').expect(200);
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('error responses include the same request id, and no stack trace', async () => {
    const res = await http().get('/me').expect(401);
    expect(res.body).toEqual({ statusCode: 401, message: 'Please sign in.', requestId: res.headers['x-request-id'] });
  });

  it('keeps a safe incoming request id and replaces an unsafe one', async () => {
    const kept = await http().get('/health').set('X-Request-Id', 'proxy-abc-12345');
    expect(kept.headers['x-request-id']).toBe('proxy-abc-12345');
    const replaced = await http().get('/health').set('X-Request-Id', '<script>alert(1)</script>');
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('log redaction', () => {
  function captureLogger() {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const params = loggerParams({ NODE_ENV: 'production' });
    const opts = params.pinoHttp as { redact: { paths: string[]; censor: string } };
    return { logger: pino({ level: 'info', redact: opts.redact }, stream), lines };
  }

  it('never writes session cookies or authorization headers to the logs', () => {
    const { logger, lines } = captureLogger();
    logger.info({
      req: { method: 'GET', url: '/me', headers: { cookie: 'll_session=super-secret-token', authorization: 'Bearer abc.def' } },
      res: { statusCode: 200, headers: { 'set-cookie': 'll_session=another-secret' } },
    });
    const out = lines.join('');
    expect(out).not.toContain('super-secret-token');
    expect(out).not.toContain('abc.def');
    expect(out).not.toContain('another-secret');
    expect(out).toContain('[Redacted]');
  });

  it('covers cookie, set-cookie and authorization', () => {
    expect(REDACT_PATHS).toEqual(
      expect.arrayContaining(['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]']),
    );
  });

  it('is silent in tests, JSON in production, pretty in development', () => {
    expect((loggerParams({ NODE_ENV: 'test' }).pinoHttp as { level: string }).level).toBe('silent');
    expect((loggerParams({ NODE_ENV: 'production' }).pinoHttp as { transport?: unknown }).transport).toBeUndefined();
    expect((loggerParams({ NODE_ENV: 'development' }).pinoHttp as { transport?: { target: string } }).transport?.target).toBe('pino-pretty');
  });
});

describe('startup configuration check', () => {
  const good = {
    DATABASE_URL: 'postgresql://u:p@host-pooler.example.neon.tech/neondb?sslmode=require',
    DIRECT_URL: 'postgresql://u:p@host.example.neon.tech/neondb?sslmode=require',
    WEB_URL: 'http://localhost:3000',
    GEMINI_API_KEY: 'test-key',
    PORT: '4100',
  };

  it('accepts a complete configuration', () => {
    expect(checkEnv(good)).toEqual({ ok: true, errors: [], warnings: [] });
  });

  it('refuses to start without DATABASE_URL, with a helpful message', () => {
    const r = checkEnv({ ...good, DATABASE_URL: '' });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/DATABASE_URL is missing — copy apps\/api\/\.env\.example/);
  });

  it.each([
    ['DATABASE_URL', 'mysql://nope', /must start with postgresql/],
    ['PORT', 'eighty', /PORT must be a number/],
    ['PORT', '70000', /PORT must be at most 65535/],
    ['WEB_URL', 'localhost:3000', /WEB_URL must be a full URL/],
    ['TRIAGE_TIMEOUT_MS', '50', /at least 1000/],
    ['AUTO_DISPATCH_LIMIT_USD', '-5', /at least 0/],
    ['HEATING_SEASON_START', 'October', /look like 10-01/],
    ['TRIAGE_SWEEP', 'maybe', /"on" or "off"/],
  ])('rejects a bad %s', (key, value, message) => {
    const r = checkEnv({ ...good, [key]: value });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(message);
  });

  it('only warns about optional settings', () => {
    const r = checkEnv({ DATABASE_URL: good.DATABASE_URL });
    expect(r.ok).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/GEMINI_API_KEY is not set/);
    expect(r.warnings.join(' ')).toMatch(/DIRECT_URL is not set/);
  });
});

describe('.env.example files', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { parseEnv } = require('node:util') as typeof import('node:util');
  const read = (p: string) => parseEnv(readFileSync(require.resolve(p), 'utf8')) as Record<string, string>;
  const api = read('../.env.example');
  const web = read('../../web/.env.example');

  it('apps/api/.env.example passes the startup check as-is', () => {
    expect(checkEnv(api)).toMatchObject({ ok: true, errors: [] });
  });

  it('contain placeholders only — no real keys, passwords or hosts', () => {
    expect(api.DATABASE_URL).toContain('USER:PASSWORD@HOST');
    expect(api.DIRECT_URL).toContain('USER:PASSWORD@HOST');
    expect(api.GEMINI_API_KEY).toBe('your-gemini-api-key');
    expect(api.SESSION_SECRET).toBe('replace-with-a-long-random-string');
    for (const value of [...Object.values(api), ...Object.values(web)]) {
      expect(value).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/); // Google API key shape
      expect(value).not.toMatch(/npg_[0-9A-Za-z]{8,}/); // Neon password shape
    }
  });

  it('documents every setting the code reads', () => {
    for (const key of [
      'DATABASE_URL', 'DIRECT_URL', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_FALLBACK_MODEL', 'TRIAGE_TIMEOUT_MS',
      'TRIAGE_SWEEP', 'HEATING_SEASON_START', 'HEATING_SEASON_END', 'AUTO_DISPATCH_LIMIT_USD', 'PORT', 'WEB_URL', 'LOG_LEVEL', 'DEMO_MODE',
    ]) {
      expect(api).toHaveProperty(key);
    }
    expect(web).toHaveProperty('NEXT_PUBLIC_API_URL');
  });
});
