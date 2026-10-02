import request from 'supertest';
import { INVALID_LINK_MESSAGE, REQUEST_LINK_MESSAGE, SESSION_COOKIE } from '@leaselens/shared';
import { hashToken } from '../src/auth/tokens';
import { createTestApp, settle, waitFor, type TestApp } from './support/test-app';

const MINUTE = 60 * 1000;

describe('Magic-link authentication', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    await t.close();
  });

  const http = () => request(t.app.getHttpServer());
  const requestLink = (email: string) => http().post('/auth/request-link').send({ email });
  const verify = (token: string) => http().post('/auth/verify').send({ token });

  /** Request a link for a known user and return the raw token from the "email". */
  async function linkFor(email: string): Promise<string> {
    await requestLink(email).expect(200);
    await waitFor(() => t.mail.sent.some((m) => m.email === email));
    return t.mail.tokenFor(email);
  }

  describe('POST /auth/request-link', () => {
    it('gives an unknown email exactly the same response as a known one', async () => {
      t.db.addUser('known@leaselens.test', 'TENANT');

      const known = await requestLink('known@leaselens.test');
      const unknown = await requestLink('nobody@leaselens.test');

      expect(unknown.status).toBe(known.status);
      expect(unknown.body).toEqual(known.body);
      expect(known.status).toBe(200);
      expect(known.body).toEqual({ message: REQUEST_LINK_MESSAGE });

      // Only the known account actually gets a link.
      await waitFor(() => t.mail.sent.length === 1);
      await settle();
      expect(t.mail.sent.map((m) => m.email)).toEqual(['known@leaselens.test']);
      expect(t.db.tokens).toHaveLength(1);
    });

    it('normalises the email (case and spaces)', async () => {
      t.db.addUser('mixed@leaselens.test', 'TENANT');
      await requestLink('  Mixed@LeaseLens.TEST ').expect(200);
      await waitFor(() => t.mail.sent.length === 1);
    });

    it('stores only a hash of the token, never the raw token', async () => {
      t.db.addUser('hash@leaselens.test', 'TENANT');
      const token = await linkFor('hash@leaselens.test');
      expect(t.db.tokens[0].tokenHash).toBe(hashToken(token));
      expect(t.db.tokens[0].tokenHash).not.toContain(token);
    });

    it('makes links expire after 15 minutes', async () => {
      t.db.addUser('ttl@leaselens.test', 'TENANT');
      const before = Date.now();
      await linkFor('ttl@leaselens.test');
      const ttl = t.db.tokens[0].expiresAt.getTime() - before;
      expect(ttl).toBeGreaterThan(14.9 * MINUTE);
      expect(ttl).toBeLessThanOrEqual(15 * MINUTE + 1000);
    });

    it('rejects an invalid email with 400', async () => {
      await requestLink('not-an-email').expect(400);
    });

    it('is rate-limited per IP (6th request in 15 minutes gets 429)', async () => {
      for (let i = 0; i < 5; i++) await requestLink(`user${i}@leaselens.test`).expect(200);
      await requestLink('user6@leaselens.test').expect(429);
    });

    it('silently caps links per email at 3 per 15 minutes, with the same response', async () => {
      t.db.addUser('busy@leaselens.test', 'TENANT');
      for (let i = 0; i < 4; i++) {
        const res = await requestLink('busy@leaselens.test').expect(200);
        expect(res.body).toEqual({ message: REQUEST_LINK_MESSAGE });
        await settle();
      }
      expect(t.db.tokens).toHaveLength(3);
    });
  });

  describe('POST /auth/verify', () => {
    it('signs in with a valid link and sets a secure session cookie', async () => {
      t.db.addUser('tenant@leaselens.test', 'TENANT', 'Jordan Ellery');
      const res = await verify(await linkFor('tenant@leaselens.test')).expect(200);

      expect(res.body).toMatchObject({
        user: { email: 'tenant@leaselens.test', name: 'Jordan Ellery', role: 'TENANT' },
        redirectTo: '/tenant',
      });
      const cookie = String(res.headers['set-cookie']);
      expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).toMatch(/Path=\//);
      expect(cookie).toMatch(/Max-Age=604800/); // 7 days
      expect(t.db.sessions).toHaveLength(1);
    });

    it('rejects a reused link', async () => {
      t.db.addUser('once@leaselens.test', 'TENANT');
      const token = await linkFor('once@leaselens.test');

      await verify(token).expect(200);
      const second = await verify(token).expect(400);
      expect(second.body.message).toBe(INVALID_LINK_MESSAGE);
      expect(second.headers['set-cookie']).toBeUndefined();
      expect(t.db.sessions).toHaveLength(1);
    });

    it('rejects an expired link', async () => {
      t.db.addUser('late@leaselens.test', 'TENANT');
      const token = await linkFor('late@leaselens.test');
      t.db.tokens[0].expiresAt = new Date(Date.now() - 1000); // 15 minutes have passed

      const res = await verify(token).expect(400);
      expect(res.body.message).toBe(INVALID_LINK_MESSAGE);
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(t.db.sessions).toHaveLength(0);
    });

    it('rejects an unknown token with the same message', async () => {
      const res = await verify('x'.repeat(43)).expect(400);
      expect(res.body.message).toBe(INVALID_LINK_MESSAGE);
    });

    it.each([
      ['VENDOR', '/tenant'],
      ['COORDINATOR', '/staff'],
      ['LEASING', '/staff'],
      ['MANAGER', '/staff'],
    ] as const)('sends %s to %s', async (role, path) => {
      const email = `${role.toLowerCase()}@leaselens.test`;
      t.db.addUser(email, role);
      const res = await verify(await linkFor(email)).expect(200);
      expect(res.body.redirectTo).toBe(path);
    });
  });

  describe('sessions', () => {
    it('GET /me returns the signed-in user', async () => {
      t.db.addUser('me@leaselens.test', 'LEASING', 'Avery Lindqvist');
      const login = await verify(await linkFor('me@leaselens.test')).expect(200);
      const cookie = String(login.headers['set-cookie']).split(';')[0];

      const me = await http().get('/me').set('Cookie', cookie).expect(200);
      expect(me.body).toEqual({
        id: expect.any(String),
        name: 'Avery Lindqvist',
        email: 'me@leaselens.test',
        role: 'LEASING',
      });
    });

    it('GET /me without a cookie is 401', async () => {
      await http().get('/me').expect(401);
    });

    it('rejects an expired session and deletes it', async () => {
      const cookie = t.signInAs('TENANT', { expiresAt: new Date(Date.now() - 1000) });
      await http().get('/me').set('Cookie', cookie).expect(401);
      expect(t.db.sessions).toHaveLength(0);
    });

    it('sign-out deletes the session and clears the cookie', async () => {
      const cookie = t.signInAs('TENANT');
      await http().get('/me').set('Cookie', cookie).expect(200);

      const out = await http().post('/auth/logout').set('Cookie', cookie).expect(200);
      expect(String(out.headers['set-cookie'])).toMatch(new RegExp(`${SESSION_COOKIE}=;`));
      expect(t.db.sessions).toHaveLength(0);
      await http().get('/me').set('Cookie', cookie).expect(401);
    });

    it('sign-out works even when already signed out', async () => {
      await http().post('/auth/logout').expect(200);
    });
  });

  describe('CORS for the web app', () => {
    it('allows credentialed requests from http://localhost:3000 only', async () => {
      const ok = await http().options('/auth/verify').set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');
      expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(ok.headers['access-control-allow-credentials']).toBe('true');

      const evil = await http().options('/auth/verify').set('Origin', 'http://evil.example')
        .set('Access-Control-Request-Method', 'POST');
      expect(evil.headers['access-control-allow-origin']).not.toBe('http://evil.example');
    });
  });
});
