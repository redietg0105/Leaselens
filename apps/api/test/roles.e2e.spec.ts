import request from 'supertest';
import { createTestApp, type TestApp } from './support/test-app';

describe('Role guards', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  const http = () => request(t.app.getHttpServer());

  it('a tenant cannot call a staff endpoint (403)', async () => {
    const cookie = t.signInAs('TENANT');
    await http().get('/test/staff-only').set('Cookie', cookie).expect(403);
  });

  it('a vendor cannot call a staff endpoint (403)', async () => {
    const cookie = t.signInAs('VENDOR');
    await http().get('/test/staff-only').set('Cookie', cookie).expect(403);
  });

  it.each(['COORDINATOR', 'LEASING', 'MANAGER'] as const)('%s can call a staff endpoint', async (role) => {
    const cookie = t.signInAs(role);
    await http().get('/test/staff-only').set('Cookie', cookie).expect(200);
  });

  it('a staff endpoint without a session is 401', async () => {
    await http().get('/test/staff-only').expect(401);
  });

  it('ignores a role sent by the client — the role comes from the database', async () => {
    const cookie = t.signInAs('TENANT');
    await http()
      .get('/test/staff-only')
      .set('Cookie', cookie)
      .set('X-Role', 'MANAGER')
      .query({ role: 'MANAGER' })
      .expect(403);
  });

  it('picks up a role change on the next request (no role cached in the cookie)', async () => {
    const cookie = t.signInAs('TENANT');
    await http().get('/test/staff-only').set('Cookie', cookie).expect(403);
    t.db.users[t.db.users.length - 1].role = 'COORDINATOR';
    await http().get('/test/staff-only').set('Cookie', cookie).expect(200);
  });

  it('denies a route that forgot to declare roles, even for a manager', async () => {
    const cookie = t.signInAs('MANAGER');
    await http().get('/test/no-policy').set('Cookie', cookie).expect(403);
  });

  it('a forged session cookie is 401', async () => {
    await http().get('/me').set('Cookie', 'll_session=forged-token-value-that-is-long-enough').expect(401);
  });

  it('GET /health stays public', async () => {
    await http().get('/health').expect(200);
  });
});
