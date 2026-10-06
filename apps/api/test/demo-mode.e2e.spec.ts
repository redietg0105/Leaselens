/**
 * Demo mode (local only): the sign-in link comes back to the browser for known accounts.
 * Outside demo mode, in production, and for unknown emails the response never contains a link.
 */
import request from 'supertest';
import {
  DEMO_ACCOUNTS,
  DEMO_LIMIT_MESSAGE,
  DemoInfoSchema,
  REQUEST_LINK_MESSAGE,
  RequestLinkResponseSchema,
  SESSION_COOKIE,
} from '@leaselens/shared';
import { checkEnv } from '../src/config/env';
import { isDemoMode, isLocalAddress } from '../src/config/demo';
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

    it('in demo mode once the per-email limit (3 per 15 min) is reached — and the page is told why', async () => {
      setEnv('on', 'development');
      for (let i = 0; i < 3; i++) expect((await requestLink('tenant@leaselens.test').expect(200)).body.demo.signInUrl).toBeDefined();
      const fourth = await requestLink('tenant@leaselens.test').expect(200);
      // Not a silent "Check your email" (the bug): demo mode says the limit was reached.
      expect(fourth.body).toEqual({ message: REQUEST_LINK_MESSAGE, demo: { limitReached: true } });
      expect(t.db.tokens).toHaveLength(3);
    });

    it('outside demo mode a capped account still gets exactly the normal response', async () => {
      setEnv('off', 'development');
      for (let i = 0; i < 4; i++) expect((await requestLink('tenant@leaselens.test').expect(200)).body).toEqual({ message: REQUEST_LINK_MESSAGE });
      await settle();
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

  /**
   * Regression (DM-R1): the demo account buttons showed "Check your email" instead of signing in.
   * These requests are exactly what the sign-in page sends: the browser's Origin and Sec-Fetch-Site
   * headers, the response parsed with the shared schema the page uses, the token taken from the link
   * the way the "Sign in now" button does, then the session cookie on the next request.
   */
  describe('demo sign-in the way the web app does it', () => {
    const fromBrowser = (r: request.Test) => r.set('Origin', 'http://localhost:3000').set('Sec-Fetch-Site', 'same-site');

    it('sign-in page → demo account → "Sign in now" → signed in', async () => {
      setEnv('on', 'development');
      // The sign-in page asks the API (server side) whether to show the demo buttons.
      const demo = DemoInfoSchema.parse((await http().get('/auth/demo').expect(200)).body);
      expect(demo.enabled).toBe(true);
      const tenantButton = demo.accounts!.find((a) => a.role === 'TENANT')!;

      // Clicking the button fills the email; "Email me a sign-in link" posts it from the browser.
      const sent = await fromBrowser(http().post('/auth/request-link')).send({ email: tenantButton.email }).expect(200);
      const parsed = RequestLinkResponseSchema.parse(sent.body);
      expect(parsed.demo && 'signInUrl' in parsed.demo).toBe(true);
      const token = new URL((parsed.demo as { signInUrl: string }).signInUrl).searchParams.get('token');

      // "Sign in now" posts the token from the browser; the cookie then works for the next page.
      const verified = await fromBrowser(http().post('/auth/verify')).send({ token }).expect(200);
      expect(verified.body.redirectTo).toBe('/tenant');
      const cookie = String(verified.headers['set-cookie']).split(';')[0];
      expect((await http().get('/me').set('Cookie', cookie).expect(200)).body).toMatchObject({ email: tenantButton.email, role: 'TENANT' });
    });

    it('over the limit the page gets limitReached (shown as a demo notice), not a silent "Check your email"', async () => {
      setEnv('on', 'development');
      for (let i = 0; i < 3; i++) await fromBrowser(http().post('/auth/request-link')).send({ email: 'tenant@leaselens.test' }).expect(200);
      const parsed = RequestLinkResponseSchema.parse(
        (await fromBrowser(http().post('/auth/request-link')).send({ email: 'tenant@leaselens.test' }).expect(200)).body,
      );
      expect(parsed.demo).toEqual({ limitReached: true });
      expect(DEMO_LIMIT_MESSAGE).toMatch(/already got 3 sign-in links in the last 15 minutes/);
    });
  });

  describe('demo mode needs a local client', () => {
    let proxied: TestApp;
    beforeEach(async () => {
      process.env.TRUST_PROXY = '1'; // so the test can present a client address via X-Forwarded-For
      proxied = await createTestApp();
      proxied.db.addUser('tenant@leaselens.test', 'TENANT', 'Jordan Ellery');
      setEnv('on', 'development');
    });
    afterEach(async () => {
      delete process.env.TRUST_PROXY;
      await proxied.close();
    });
    const from = (ip: string) => ({
      link: () => request(proxied.app.getHttpServer()).post('/auth/request-link').set('X-Forwarded-For', ip).send({ email: 'tenant@leaselens.test' }),
      demo: () => request(proxied.app.getHttpServer()).get('/auth/demo').set('X-Forwarded-For', ip),
    });

    it('a request from an internet address gets no link and no demo accounts', async () => {
      const res = await from('203.0.113.9').link().expect(200);
      expect(res.body).toEqual({ message: REQUEST_LINK_MESSAGE });
      expect((await from('203.0.113.9').demo().expect(200)).body).toEqual({ enabled: false });
    });

    it('a phone on the same Wi-Fi still gets the demo link', async () => {
      expect((await from('192.168.1.20').link().expect(200)).body.demo.signInUrl).toBeDefined();
      expect((await from('192.168.1.20').demo().expect(200)).body.enabled).toBe(true);
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

  it.each([
    ['127.0.0.1', true],
    ['::1', true],
    ['::ffff:127.0.0.1', true], // how Node reports an IPv4 client on a dual-stack socket
    ['::ffff:192.168.1.20', true],
    ['10.1.2.3', true],
    ['172.16.0.1', true],
    ['169.254.10.10', true],
    ['fd12:3456::1', true],
    ['fe80::1', true],
    ['203.0.113.9', false],
    ['::ffff:203.0.113.9', false],
    ['172.32.0.1', false],
    ['2001:db8::1', false],
    ['999.1.1.1', false],
    ['', false],
    [undefined, false],
  ])('client address %p counts as local: %p', (address, local) => {
    expect(isLocalAddress(address)).toBe(local);
  });

  it('the demo accounts match the seeded users', () => {
    const seeded = buildSeedData().users.map((u) => ({ role: u.role, email: u.email, name: u.name }));
    for (const a of DEMO_ACCOUNTS) expect(seeded).toContainEqual({ role: a.role, email: a.email, name: a.name });
    expect(DEMO_ACCOUNTS).toHaveLength(seeded.length);
  });
});
