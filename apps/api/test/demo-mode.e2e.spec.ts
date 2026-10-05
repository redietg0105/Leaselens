/**
 * Demo mode (local only): the sign-in link comes back to the browser for known accounts.
 * Outside demo mode, in production, and for unknown emails the response never contains a link.
 */
import request from 'supertest';
import { DEMO_ACCOUNTS, REQUEST_LINK_MESSAGE, SESSION_COOKIE } from '@leaselens/shared';
import { checkEnv } from '../src/config/env';
import { isDemoMode } from '../src/config/demo';
import { buildSeedData } from '../prisma/seed-data';
import { createTestApp, settle, waitFor, type TestApp } from './support/test-app';

const saved = { DEMO_MODE: process.env.DEMO_MODE, NODE_ENV: process.env.NODE_ENV };
function setEnv(demo: string | undefined, nodeEnv: string | undefined) {
  if (demo === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = demo;
  if (nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnv;
}

describe('Demo mode', () => {
  let t: TestApp;
  beforeEach(async () => {
    t = await createTestApp();
    t.db.addUser('tenant@leaselens.test', 'TENANT', 'Jordan Ellery');
  });
  afterEach(async () => {
    setEnv(saved.DEMO_MODE, saved.NODE_ENV);
    await t.close();
  });

  const http = () => request(t.app.getHttpServer());
  const requestLink = (email: string) => http().post('/auth/request-link').send({ email });

  describe('no link in the response', () => {
    it('when demo mode is off (known account)', async () => {
      setEnv('off', 'development');
      const res = await requestLink('tenant@leaselens.test').expect(200);
      expect(res.body).toEqual({ message: REQUEST_LINK_MESSAGE });
      await waitFor(() => t.mail.sent.length === 1); // the link is still "emailed" as usual
    });

    it('when DEMO_MODE is not set at all', async () => {
      setEnv(undefined, 'development');
      expect((await requestLink('tenant@leaselens.test').expect(200)).body).toEqual({ message: REQUEST_LINK_MESSAGE });
    });

    it('in production, even with DEMO_MODE="on"', async () => {
      setEnv('on', 'production');
      expect(isDemoMode()).toBe(false);
      const res = await requestLink('tenant@leaselens.test').expect(200);
      expect(res.body).toEqual({ message: REQUEST_LINK_MESSAGE });
      expect(JSON.stringify(res.body)).not.toContain('token');
    });

    it('for an unknown email in demo mode — exactly the same response as outside demo mode', async () => {
      setEnv('off', 'development');
      const normal = await requestLink('nobody@leaselens.test').expect(200);
      setEnv('on', 'development');
      const demo = await requestLink('nobody@leaselens.test').expect(200);
      expect(demo.status).toBe(normal.status);
      expect(demo.body).toEqual(normal.body);
      expect(demo.body).toEqual({ message: REQUEST_LINK_MESSAGE });
      await settle();
      expect(t.db.tokens).toHaveLength(0);
    });

    it('in demo mode once the per-email limit (3 per 15 min) is reached', async () => {
      setEnv('on', 'development');
      for (let i = 0; i < 3; i++) expect((await requestLink('tenant@leaselens.test').expect(200)).body.demo).toBeDefined();
      const fourth = await requestLink('tenant@leaselens.test').expect(200);
      expect(fourth.body).toEqual({ message: REQUEST_LINK_MESSAGE });
      expect(t.db.tokens).toHaveLength(3);
    });
  });

  describe('demo mode on (development)', () => {
    it('returns the sign-in link for a known account, and the link signs in', async () => {
      setEnv('on', 'development');
      const res = await requestLink('tenant@leaselens.test').expect(200);
      expect(res.body.message).toBe(REQUEST_LINK_MESSAGE);
      const url = new URL(res.body.demo.signInUrl);
      expect(url.pathname).toBe('/auth/verify');
      // It is the same link that was "emailed".
      expect(t.mail.sent.map((m) => m.url)).toEqual([res.body.demo.signInUrl]);

      const signIn = await http().post('/auth/verify').send({ token: url.searchParams.get('token') }).expect(200);
      expect(signIn.body).toMatchObject({ user: { email: 'tenant@leaselens.test' }, redirectTo: '/tenant' });
      expect(String(signIn.headers['set-cookie'])).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    });

    it('keeps the IP rate limit (6th request in 15 minutes gets 429)', async () => {
      setEnv('on', 'development');
      for (let i = 0; i < 5; i++) await requestLink(`user${i}@leaselens.test`).expect(200);
      await requestLink('tenant@leaselens.test').expect(429);
    });
  });

  describe('GET /auth/demo', () => {
    it('lists the demo accounts only in demo mode', async () => {
      setEnv('on', 'development');
      const on = await http().get('/auth/demo').expect(200);
      expect(on.body.enabled).toBe(true);
      expect(on.body.accounts.map((a: { role: string }) => a.role)).toEqual(['TENANT', 'COORDINATOR', 'MANAGER', 'VENDOR', 'LEASING']);

      setEnv('off', 'development');
      expect((await http().get('/auth/demo').expect(200)).body).toEqual({ enabled: false });
      setEnv('on', 'production');
      expect((await http().get('/auth/demo').expect(200)).body).toEqual({ enabled: false });
    });
  });
});

describe('Demo mode settings', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@h/db' };

  it('the API refuses to start with DEMO_MODE="on" in production', () => {
    const r = checkEnv({ ...base, DEMO_MODE: 'on', NODE_ENV: 'production' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/DEMO_MODE must be "off" when NODE_ENV is production/);
  });

  it.each([
    [{ DEMO_MODE: 'on' }, true],
    [{ DEMO_MODE: 'on', NODE_ENV: 'development' }, true],
    [{ DEMO_MODE: 'off', NODE_ENV: 'production' }, true],
    [{ DEMO_MODE: 'yes' }, false],
  ])('%p → valid: %p', (vars, ok) => {
    expect(checkEnv({ ...base, ...vars }).ok).toBe(ok);
  });

  it('isDemoMode needs DEMO_MODE="on" and a non-production NODE_ENV', () => {
    expect(isDemoMode({ DEMO_MODE: 'on' })).toBe(true);
    expect(isDemoMode({ DEMO_MODE: 'on', NODE_ENV: 'production' })).toBe(false);
    expect(isDemoMode({ DEMO_MODE: 'off' })).toBe(false);
    expect(isDemoMode({ DEMO_MODE: 'ON' })).toBe(false);
    expect(isDemoMode({})).toBe(false);
  });

  it('demo mode only works with a local WEB_URL, in case NODE_ENV was left unset on a server', () => {
    const r = checkEnv({ ...base, DEMO_MODE: 'on', WEB_URL: 'https://leaselens.example.com' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/only works when WEB_URL is localhost or a private network address/);
    expect(isDemoMode({ DEMO_MODE: 'on', WEB_URL: 'https://leaselens.example.com' })).toBe(false);
    expect(checkEnv({ ...base, DEMO_MODE: 'off', WEB_URL: 'https://leaselens.example.com' }).ok).toBe(true);
  });

  it.each([
    ['http://localhost:3000', true],
    ['http://127.0.0.1:3000', true],
    ['http://192.168.1.20:3000', true], // phone on the same Wi-Fi
    ['http://10.0.0.5:3000', true],
    ['http://172.20.1.1:3000', true],
    ['http://172.32.1.1:3000', false],
    ['https://leaselens.example.com', false],
    ['http://203.0.113.7', false],
    ['http://localhost.evil.example', false],
  ])('WEB_URL %s counts as local: %p', (url, local) => {
    expect(isDemoMode({ DEMO_MODE: 'on', WEB_URL: url })).toBe(local);
  });

  it('the demo accounts match the seeded users', () => {
    const seeded = buildSeedData().users.map((u) => ({ role: u.role, email: u.email, name: u.name }));
    for (const a of DEMO_ACCOUNTS) expect(seeded).toContainEqual({ role: a.role, email: a.email, name: a.name });
    expect(DEMO_ACCOUNTS).toHaveLength(seeded.length);
  });
});
