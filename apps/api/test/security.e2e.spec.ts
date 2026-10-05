/**
 * Security hardening: cross-site writes, rate limits, demo-mode safeguards, personal data in logs,
 * and raw SQL.
 */
import request from 'supertest';
import { CROSS_SITE_MESSAGE } from '../src/common/same-origin';
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
