/**
 * Reviewer access (live site, for grading): an access code plus a role signs in to that role's seeded demo
 * account. Off unless REVIEWER_ACCESS="on" with a long enough code; wrong codes are rate limited; only the five
 * seeded ids can ever be used; each sign-in is audited with the role only; the code is never logged.
 */
import { Logger } from '@nestjs/common';
import request from 'supertest';
import {
  REVIEWER_ACCOUNTS,
  REVIEWER_LIMIT_MESSAGE,
  SESSION_COOKIE,
  WRONG_REVIEWER_CODE_MESSAGE,
} from '@leaselens/shared';
import type { Role } from '@prisma/client';
import { codeMatches, REVIEWER_USER_IDS, reviewerCode, WrongCodeLimiter } from '../src/auth/reviewer';
import { checkEnv, trimSecrets } from '../src/config/env';
import { isDemoMode } from '../src/config/demo';
import { buildSeedData } from '../prisma/seed-data';
import { createTestApp, type TestApp } from './support/test-app';

const CODE = 'grading-code-7f3k9q2m';
const saved = { REVIEWER_ACCESS: process.env.REVIEWER_ACCESS, REVIEWER_ACCESS_CODE: process.env.REVIEWER_ACCESS_CODE, TRUST_PROXY: process.env.TRUST_PROXY };

function setReviewer(access: string | undefined, code: string | undefined) {
  if (access === undefined) delete process.env.REVIEWER_ACCESS;
  else process.env.REVIEWER_ACCESS = access;
  if (code === undefined) delete process.env.REVIEWER_ACCESS_CODE;
  else process.env.REVIEWER_ACCESS_CODE = code;
}

/** The five seeded demo users, with their real seeded ids. */
function addSeededUsers(t: TestApp) {
  for (const [role, id] of Object.entries(REVIEWER_USER_IDS) as [Role, string][]) {
    t.db.users.push({ id, email: `${role.toLowerCase()}@leaselens.test`, name: `Seeded ${role}`, role, unitId: null, vendorId: null, createdAt: new Date() });
  }
}

describe('Reviewer access', () => {
  let t: TestApp;
  let lines: string[];
  beforeEach(async () => {
    lines = [];
    const capture = (msg: unknown) => {
      lines.push(String(msg));
    };
    jest.spyOn(Logger.prototype, 'log').mockImplementation(capture);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(capture);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(capture);
    t = await createTestApp();
    addSeededUsers(t);
  });
  afterEach(async () => {
    setReviewer(saved.REVIEWER_ACCESS, saved.REVIEWER_ACCESS_CODE);
    if (saved.TRUST_PROXY === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = saved.TRUST_PROXY;
    jest.restoreAllMocks();
    await t.close();
  });

  const http = () => request(t.app.getHttpServer());
  const signIn = (body: Record<string, unknown>, ip?: string) => {
    const req = http().post('/auth/reviewer');
    if (ip) req.set('X-Forwarded-For', ip);
    return req.send(body);
  };
  const cookieFrom = (res: request.Response) => {
    const set = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    return set.find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.split(';')[0];
  };

  describe('off by default', () => {
    it.each([
      ['not set at all', undefined, undefined],
      ['REVIEWER_ACCESS="off" (even with a code)', 'off', CODE],
      ['REVIEWER_ACCESS="on" without a code', 'on', undefined],
      ['REVIEWER_ACCESS="on" with a code shorter than 16 characters', 'on', 'short-code-15chr'.slice(0, 15)],
    ])('%s: the sign-in page hides it and the route answers 404', async (_label, access, code) => {
      setReviewer(access, code);
      expect((await http().get('/auth/reviewer').expect(200)).body).toEqual({ enabled: false });
      const res = await signIn({ code: code ?? CODE, role: 'TENANT' }).expect(404);
      expect(cookieFrom(res)).toBeUndefined();
      expect(t.db.sessions).toHaveLength(0);
      expect(t.db.auditLogs).toHaveLength(0);
    });

    it('the test setup keeps it off even if a local .env turns it on', () => {
      setReviewer(saved.REVIEWER_ACCESS, saved.REVIEWER_ACCESS_CODE);
      expect(reviewerCode()).toBeNull();
    });
  });

  describe('switched on', () => {
    beforeEach(() => setReviewer('on', CODE));

    it('the sign-in page is told to show it (and nothing else)', async () => {
      expect((await http().get('/auth/reviewer').expect(200)).body).toEqual({ enabled: true });
    });

    it.each(REVIEWER_ACCOUNTS.map((a) => a.role))('the right code signs in as the seeded %s account, with the normal session cookie', async (role) => {
      const res = await signIn({ code: CODE, role }).expect(200);
      const cookie = cookieFrom(res);
      expect(cookie).toBeDefined();
      const set = ([] as string[]).concat(res.headers['set-cookie']).join(';');
      expect(set).toMatch(/HttpOnly/i);
      expect(set).toMatch(/SameSite=Lax/i);
      expect(res.body.user).toMatchObject({ id: REVIEWER_USER_IDS[role], role });
      const me = await http().get('/me').set('Cookie', cookie!).expect(200);
      expect(me.body.id).toBe(REVIEWER_USER_IDS[role]);
    });

    it('the session gets the normal role checks: a reviewer tenant is refused staff routes, a coordinator is allowed', async () => {
      const tenant = cookieFrom(await signIn({ code: CODE, role: 'TENANT' }).expect(200))!;
      await http().get('/test/staff-only').set('Cookie', tenant).expect(403);
      const coordinator = cookieFrom(await signIn({ code: CODE, role: 'COORDINATOR' }).expect(200))!;
      await http().get('/test/staff-only').set('Cookie', coordinator).expect(200);
    });

    it('surrounding spaces in the typed code are ignored (the stored secret is trimmed too)', async () => {
      await signIn({ code: `  ${CODE} `, role: 'TENANT' }).expect(200);
    });

    it('a wrong code is refused: no session, no cookie, no audit entry', async () => {
      const res = await signIn({ code: `${CODE}x`, role: 'MANAGER' }).expect(403);
      expect(res.body.message).toBe(WRONG_REVIEWER_CODE_MESSAGE);
      expect(cookieFrom(res)).toBeUndefined();
      expect(t.db.sessions).toHaveLength(0);
      expect(t.db.auditLogs).toHaveLength(0);
    });

    it('an empty code or an unknown role is a 400 (and does not count as a wrong code)', async () => {
      await signIn({ code: '', role: 'TENANT' }).expect(400);
      await signIn({ code: CODE, role: 'ADMIN' }).expect(400);
      await signIn({ code: CODE }).expect(400);
      for (let i = 0; i < 6; i++) await signIn({ code: '', role: 'TENANT' }).expect(400);
      await signIn({ code: CODE, role: 'TENANT' }).expect(200);
    });

    describe('only the five seeded demo accounts', () => {
      it('a user id or email in the request is ignored', async () => {
        const other = t.db.addUser('real.person@example.test', 'MANAGER', 'Real Person');
        const res = await signIn({ code: CODE, role: 'MANAGER', userId: other.id, id: other.id, email: other.email }).expect(200);
        expect(res.body.user.id).toBe('seed_user_manager');
      });

      it('another account with the same role is never used, even when the seeded one is missing', async () => {
        t.db.users = t.db.users.filter((u) => u.id !== 'seed_user_leasing');
        t.db.addUser('leasing.agent@example.test', 'LEASING', 'Another Agent');
        const res = await signIn({ code: CODE, role: 'LEASING' }).expect(404);
        expect(cookieFrom(res)).toBeUndefined();
        expect(t.db.sessions).toHaveLength(0);
      });

      it('a seeded id whose role was changed is refused (no sign-in with a different role than asked)', async () => {
        t.db.users.find((u) => u.id === 'seed_user_vendor')!.role = 'MANAGER';
        await signIn({ code: CODE, role: 'VENDOR' }).expect(404);
        expect(t.db.sessions).toHaveLength(0);
      });

      it('the fixed ids are exactly the seeded demo users, one per role', () => {
        const seeded = buildSeedData().users.filter((u) => u.id.startsWith('seed_user_'));
        for (const [role, id] of Object.entries(REVIEWER_USER_IDS)) {
          expect(seeded.find((u) => u.id === id)?.role).toBe(role);
        }
        expect(Object.keys(REVIEWER_USER_IDS).sort()).toEqual(REVIEWER_ACCOUNTS.map((a) => a.role).sort());
        expect(Object.keys(REVIEWER_USER_IDS)).not.toContain('ADMIN');
      });
    });

    it('each sign-in writes one audit entry with the role only', async () => {
      await signIn({ code: CODE, role: 'COORDINATOR' }).expect(200);
      expect(t.db.auditLogs).toHaveLength(1);
      const entry = t.db.auditLogs[0];
      expect(entry).toMatchObject({
        actorId: 'seed_user_coordinator',
        action: 'auth.reviewer_signin',
        entity: 'User',
        entityId: 'seed_user_coordinator',
        after: { role: 'COORDINATOR' },
      });
      expect(entry.after).toEqual({ role: 'COORDINATOR' });
      expect(JSON.stringify(entry)).not.toContain(CODE);
    });

    it('the code never appears in the logs, right or wrong', async () => {
      await signIn({ code: CODE, role: 'TENANT' }).expect(200);
      await signIn({ code: 'wrong-code-wrong-code', role: 'TENANT' }).expect(403);
      const all = lines.join('\n');
      expect(all).toContain('Reviewer sign-in as TENANT');
      expect(all).toContain('Reviewer sign-in: wrong code');
      expect(all).not.toContain(CODE);
      expect(all).not.toContain('wrong-code-wrong-code');
    });

    describe('rate limit on wrong codes', () => {
      it('5 wrong codes, then "Too many attempts" — even for the right code', async () => {
        for (let i = 0; i < 5; i++) await signIn({ code: `wrong-${i}`, role: 'TENANT' }).expect(403);
        const sixth = await signIn({ code: 'wrong-5', role: 'TENANT' }).expect(429);
        expect(sixth.body.message).toBe(REVIEWER_LIMIT_MESSAGE);
        expect(sixth.body.message).toMatch(/^Too many attempts/);
        await signIn({ code: CODE, role: 'TENANT' }).expect(429);
        expect(t.db.sessions).toHaveLength(0);
      });

      it('right codes are not counted, so switching accounts never locks a reviewer out', async () => {
        for (let i = 0; i < 4; i++) await signIn({ code: `wrong-${i}`, role: 'TENANT' }).expect(403);
        for (const { role } of REVIEWER_ACCOUNTS) await signIn({ code: CODE, role }).expect(200);
        await signIn({ code: CODE, role: 'TENANT' }).expect(200);
      });

      it('per address: behind the proxy another visitor is not affected', async () => {
        process.env.TRUST_PROXY = '1';
        await t.close();
        t = await createTestApp();
        addSeededUsers(t);
        for (let i = 0; i < 5; i++) await signIn({ code: 'wrong', role: 'TENANT' }, '203.0.113.1').expect(403);
        await signIn({ code: CODE, role: 'TENANT' }, '203.0.113.1').expect(429);
        await signIn({ code: CODE, role: 'TENANT' }, '203.0.113.2').expect(200);
      });

      it('50 wrong codes from all addresses together pause it for everyone (bounds guessing with faked addresses)', async () => {
        process.env.TRUST_PROXY = '1';
        await t.close();
        t = await createTestApp();
        addSeededUsers(t);
        for (let ip = 0; ip < 10; ip++) {
          for (let i = 0; i < 5; i++) await signIn({ code: 'wrong', role: 'TENANT' }, `198.51.100.${ip}`).expect(403);
        }
        const res = await signIn({ code: CODE, role: 'TENANT' }, '192.0.2.77').expect(429);
        expect(res.body.message).toBe(REVIEWER_LIMIT_MESSAGE);
        expect(lines.join('\n')).toContain('Reviewer sign-in paused');
      });
    });

    it('demo mode is untouched: still off, and /auth/demo lists no accounts', async () => {
      expect(isDemoMode()).toBe(false);
      expect((await http().get('/auth/demo').expect(200)).body).toEqual({ enabled: false });
    });
  });
});

describe('WrongCodeLimiter', () => {
  it('lets an address try again once its wrong codes are 15 minutes old', () => {
    let now = 0;
    const limiter = new WrongCodeLimiter(5, 50, 15 * 60_000, () => now);
    for (let i = 0; i < 5; i++) limiter.recordWrong('a');
    expect(limiter.blocked('a')).toBe('address');
    expect(limiter.blocked('b')).toBeNull();
    now = 15 * 60_000 - 1;
    expect(limiter.blocked('a')).toBe('address');
    now = 15 * 60_000 + 1;
    expect(limiter.blocked('a')).toBeNull();
  });

  it('the overall pause also ends after 15 minutes', () => {
    let now = 0;
    const limiter = new WrongCodeLimiter(5, 3, 1000, () => now);
    for (const a of ['x', 'y', 'z']) limiter.recordWrong(a);
    expect(limiter.blocked('fresh')).toBe('overall');
    now = 1001;
    expect(limiter.blocked('fresh')).toBeNull();
  });
});

describe('reviewer access code handling', () => {
  it('compares codes in constant time (hashes of equal length, so different lengths cannot throw or leak)', () => {
    expect(codeMatches(CODE, CODE)).toBe(true);
    expect(codeMatches(`${CODE}x`, CODE)).toBe(false);
    expect(codeMatches('', CODE)).toBe(false);
    expect(codeMatches('a'.repeat(500), CODE)).toBe(false);
  });

  it('the startup check needs a code of at least 16 characters when it is on', () => {
    const base = { DATABASE_URL: 'postgresql://u:p@h/db' };
    expect(checkEnv({ ...base, REVIEWER_ACCESS: 'on' }).errors.join(' ')).toMatch(/at least 16 characters/);
    expect(checkEnv({ ...base, REVIEWER_ACCESS: 'on', REVIEWER_ACCESS_CODE: 'x'.repeat(15) }).ok).toBe(false);
    expect(checkEnv({ ...base, REVIEWER_ACCESS: 'on', REVIEWER_ACCESS_CODE: CODE }).ok).toBe(true);
    expect(checkEnv({ ...base, REVIEWER_ACCESS: 'off' }).ok).toBe(true);
    expect(checkEnv({ ...base, REVIEWER_ACCESS: 'yes' }).errors.join(' ')).toMatch(/REVIEWER_ACCESS must be "on" or "off"/);
    // The message never contains the code itself.
    expect(checkEnv({ ...base, REVIEWER_ACCESS: 'on', REVIEWER_ACCESS_CODE: 'secret-short' }).errors.join(' ')).not.toContain('secret-short');
  });

  it('the secret is trimmed when the API loads its settings', () => {
    const env: NodeJS.ProcessEnv = { REVIEWER_ACCESS_CODE: `${CODE}\r\n` };
    trimSecrets(env);
    expect(env.REVIEWER_ACCESS_CODE).toBe(CODE);
  });

  it('works only for exact "on"', () => {
    expect(reviewerCode({ REVIEWER_ACCESS: 'ON', REVIEWER_ACCESS_CODE: CODE })).toBeNull();
    expect(reviewerCode({ REVIEWER_ACCESS: 'on', REVIEWER_ACCESS_CODE: CODE })).toBe(CODE);
  });
});
