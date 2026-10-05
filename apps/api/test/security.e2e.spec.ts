/**
 * Security hardening: cross-site writes, rate limits, demo-mode safeguards, personal data in logs,
 * and raw SQL.
 */
import request from 'supertest';
import { CROSS_SITE_MESSAGE } from '../src/common/same-origin';
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
