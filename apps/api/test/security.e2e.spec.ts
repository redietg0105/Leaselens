/**
 * Security hardening: cross-site writes, rate limits, demo-mode safeguards, personal data in logs,
 * and raw SQL.
 */
import { Logger } from '@nestjs/common';
import request from 'supertest';
import { ConsoleMailService } from '../src/auth/mail.service';
import { errorText } from '../src/common/error-text';
import { CROSS_SITE_MESSAGE } from '../src/common/same-origin';
import { NotificationsService } from '../src/notifications/notifications.service';
import { NEW_REQUESTS_PER_WINDOW } from '../src/work-orders/work-orders.controller';
import { createTestApp, type TestApp } from './support/test-app';

const WEB = 'http://localhost:3000';

describe('cross-site writes (CSRF defence in depth)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });
  const http = () => request(t.app.getHttpServer());

  it('refuses a write whose Origin is another site, even with a valid session', async () => {
    const cookie = t.signInAs('TENANT');
    const res = await http().post('/auth/logout').set('Cookie', cookie).set('Origin', 'https://evil.example').expect(403);
    expect(res.body).toMatchObject({ statusCode: 403, message: CROSS_SITE_MESSAGE });
    expect(t.db.sessions).toHaveLength(1); // still signed in
  });

  it('refuses a write the browser marks as cross-site', async () => {
    await http().post('/auth/request-link').set('Sec-Fetch-Site', 'cross-site').send({ email: 'a@b.test' }).expect(403);
  });

  it('a null Origin (sandboxed frames, data: pages) is refused too', async () => {
    await http().post('/auth/request-link').set('Origin', 'null').send({ email: 'a@b.test' }).expect(403);
  });

  it('allows writes from the web app, and requests without these headers (curl, server-to-server)', async () => {
    await http().post('/auth/logout').set('Origin', WEB).set('Sec-Fetch-Site', 'same-site').expect(200);
    await http().post('/auth/logout').expect(200);
  });

  it('never blocks reads', async () => {
    await http().get('/health').set('Origin', 'https://evil.example').set('Sec-Fetch-Site', 'cross-site').expect(200);
  });
});

describe('personal data stays out of production logs', () => {
  let t: TestApp;
  let lines: string[];
  const saved = process.env.NODE_ENV;
  beforeEach(async () => {
    t = await createTestApp();
    lines = [];
    const capture = (msg: unknown) => {
      lines.push(String(msg));
    };
    jest.spyOn(Logger.prototype, 'log').mockImplementation(capture);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(capture);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(capture);
    process.env.NODE_ENV = 'production';
  });
  afterEach(async () => {
    process.env.NODE_ENV = saved;
    jest.restoreAllMocks();
    await t.close();
  });

  it('notifications log only the channel and id, not the recipient or the tenant’s words', async () => {
    const notifications = t.app.get(NotificationsService);
    await notifications.send({ channel: 'EMAIL', to: 'jordan@example.test', body: 'Your request "call me at 202-555-0143" is completed.' });
    await notifications.send({ channel: 'ONCALL', to: 'on-call coordinator', body: 'EMERGENCY (gas-smell): I smell gas, Jordan Ellery, unit 302' });
    expect(lines).toHaveLength(2);
    expect(lines.join('\n')).not.toMatch(/jordan|202-555|gas|Ellery/i);
    expect(lines[0]).toMatch(/^\[EMAIL\] notification \S+ queued$/);
    expect(t.db.notifications).toHaveLength(2); // still stored for delivery
  });

  it('the mail stand-in does not log the email address', async () => {
    // The real service (the test app swaps in a fake that captures links).
    await new ConsoleMailService().sendMagicLink('jordan@example.test', 'http://localhost:3000/auth/verify?token=secret');
    expect(lines).toEqual(['Email sending is not configured; a sign-in link was not sent.']);
  });

  it('Prisma errors are logged by class, code and reason only — never the values in the query', () => {
    class PrismaClientValidationError extends Error {}
    const err = new PrismaClientValidationError(
      'Invalid `prisma.workOrder.create()` invocation:\n\n{\n  data: {\n    description: "Call Jordan at 202-555-0143"\n  }\n}\n\nArgument `unitId` is missing.',
    );
    expect(errorText(err, true)).toBe('PrismaClientValidationError: Argument `unitId` is missing.');
    class PrismaClientKnownRequestError extends Error {
      code = 'P2002';
    }
    expect(errorText(new PrismaClientKnownRequestError('Invalid call:\n\nUnique constraint failed on the fields: (`email`)'))).toBe(
      'PrismaClientKnownRequestError P2002: Unique constraint failed on the fields: (`email`)',
    );
  });
});

describe('raw SQL', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readdirSync, readFileSync, statSync } = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('node:path') as typeof import('node:path');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? files(full) : /\.ts$/.test(name) ? [full] : [];
    });

  it('the app never builds SQL from strings (pgvector queries must use the $queryRaw`...` tagged template)', () => {
    const root = path.resolve(__dirname, '..');
    const offenders = [...files(path.join(root, 'src')), ...files(path.join(root, 'prisma'))].filter((f) =>
      /\$(queryRaw|executeRaw)Unsafe\b|Prisma\.raw\s*\(/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

describe('rate limits', () => {
  let t: TestApp;
  afterEach(async () => {
    delete process.env.TRUST_PROXY;
    await t.close();
  });
  const http = () => request(t.app.getHttpServer());

  it(`creating requests is limited to ${NEW_REQUESTS_PER_WINDOW} per 10 minutes (each one costs an AI call)`, async () => {
    t = await createTestApp();
    const unit = t.db.addUnit('302');
    const cookie = t.signInAs('TENANT', { unitId: unit.id });
    const send = () =>
      http().post('/work-orders').set('Cookie', cookie).field('description', 'The kitchen tap drips all night.').field('entryPermission', 'YES');
    for (let i = 0; i < NEW_REQUESTS_PER_WINDOW; i++) await send().expect(201);
    const res = await send().expect(429);
    expect(res.body.message).toBe('Too many requests. Please wait a few minutes and try again.');
    expect(t.db.workOrders).toHaveLength(NEW_REQUESTS_PER_WINDOW);
  });

  it('behind a proxy (TRUST_PROXY=1) each visitor has their own limit', async () => {
    process.env.TRUST_PROXY = '1';
    t = await createTestApp();
    const link = (ip: string) => http().post('/auth/request-link').set('X-Forwarded-For', ip).send({ email: 'someone@example.test' });
    for (let i = 0; i < 5; i++) await link('203.0.113.1').expect(200);
    await link('203.0.113.1').expect(429);
    await link('203.0.113.2').expect(200);
  });

  it('without TRUST_PROXY a forged X-Forwarded-For does not dodge the limit', async () => {
    t = await createTestApp();
    const link = (ip: string) => http().post('/auth/request-link').set('X-Forwarded-For', ip).send({ email: 'someone@example.test' });
    for (let i = 0; i < 5; i++) await link(`198.51.100.${i}`).expect(200);
    await link('198.51.100.99').expect(429);
  });
});
