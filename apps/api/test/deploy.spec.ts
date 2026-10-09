/**
 * Pieces used when deployed on Cloud Run: secret trimming, settings checks, Cloud Storage, SMTP email, and the
 * one-time client-IP check for TRUST_PROXY.
 */
import { Logger } from '@nestjs/common';
import { ConsoleMailService, mailServiceFromEnv, SmtpMailService } from '../src/auth/mail.service';
import { clientIpProbe, maskIp } from '../src/common/client-ip-probe';
import { checkEnv, trimSecrets } from '../src/config/env';
import { GcsStorageService, metadataTokenSource, StorageObjectNotFound } from '../src/storage/gcs-storage.service';
import { storageFromEnv } from '../src/storage/storage.module';
import { LocalStorageService } from '../src/storage/storage.service';

const KEY = 'work-orders/0b6f9c1e-2a3d-4e5f-8a9b-0c1d2e3f4a5b.jpg';

describe('secrets entered by hand are trimmed', () => {
  it('removes a trailing newline / spaces from every secret setting, and leaves other settings alone', () => {
    const env: NodeJS.ProcessEnv = {
      DATABASE_URL: '  postgresql://u:p@h/db\r\n',
      DIRECT_URL: 'postgresql://u:p@h/db\n',
      GEMINI_API_KEY: 'key-123 \n',
      SMTP_PASSWORD: '\tabcd efgh ijkl mnop\n', // inner spaces (Gmail shows app passwords in groups) are kept
      SESSION_SECRET: ' s ',
      WEB_URL: 'https://example.test',
    };
    trimSecrets(env);
    expect(env).toEqual({
      DATABASE_URL: 'postgresql://u:p@h/db',
      DIRECT_URL: 'postgresql://u:p@h/db',
      GEMINI_API_KEY: 'key-123',
      SMTP_PASSWORD: 'abcd efgh ijkl mnop',
      SESSION_SECRET: 's',
      WEB_URL: 'https://example.test',
    });
  });

  it('a database URL with a trailing newline passes the startup check once trimmed', () => {
    const env: NodeJS.ProcessEnv = { DATABASE_URL: 'postgresql://u:p@h/db\n' };
    trimSecrets(env);
    expect(checkEnv(env).ok).toBe(true);
  });

  it('missing secrets stay missing', () => {
    const env: NodeJS.ProcessEnv = {};
    trimSecrets(env);
    expect(env).toEqual({});
  });
});

describe('deployment settings', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@h/db' };
  it('Cloud Storage needs a bucket name', () => {
    expect(checkEnv({ ...base, STORAGE_DRIVER: 'gcs' }).errors.join(' ')).toMatch(/needs GCS_BUCKET/);
    expect(checkEnv({ ...base, STORAGE_DRIVER: 'gcs', GCS_BUCKET: 'leaselens-511100-uploads' }).ok).toBe(true);
  });
  it('SMTP needs a user and password', () => {
    expect(checkEnv({ ...base, SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'a@gmail.com' }).errors.join(' ')).toMatch(/SMTP_USER and SMTP_PASSWORD/);
  });
  it('warns when production has no email sender', () => {
    expect(checkEnv({ ...base, NODE_ENV: 'production' }).warnings.join(' ')).toMatch(/sign-in emails will not be sent/);
  });
});

describe('Cloud Storage (JSON API with the service account token)', () => {
  function fakeFetch(responses: Record<string, { status: number; body?: unknown }>) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const impl = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const method = init?.method ?? 'GET';
      const r = responses[`${method} ${String(url).split('?')[0]}`] ?? { status: 200 };
      const body = r.body instanceof Buffer ? r.body : JSON.stringify(r.body ?? {});
      return new Response(r.status === 204 ? null : body, { status: r.status });
    }) as typeof fetch;
    return { impl, calls };
  }
  const token = async () => 'tok';
  const objectUrl = `https://storage.googleapis.com/storage/v1/b/my-bucket/o/${encodeURIComponent(KEY)}`;

  it('creates objects without ever overwriting, with the token and the image type', async () => {
    const f = fakeFetch({});
    await new GcsStorageService('my-bucket', token, f.impl).save(KEY, Buffer.from('jpg'));
    const { url, init } = f.calls[0];
    expect(url).toBe(`https://storage.googleapis.com/upload/storage/v1/b/my-bucket/o?uploadType=media&ifGenerationMatch=0&name=${encodeURIComponent(KEY)}`);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer tok', 'Content-Type': 'image/jpeg' });
  });

  it('reads an object; a missing one is a not-found error (the photo route answers 404)', async () => {
    const f = fakeFetch({ [`GET ${objectUrl}`]: { status: 200, body: Buffer.from('photo-bytes') } });
    expect((await new GcsStorageService('my-bucket', token, f.impl).read(KEY)).toString()).toBe('photo-bytes');
    expect(f.calls[0].url).toBe(`${objectUrl}?alt=media`);
    const missing = fakeFetch({ [`GET ${objectUrl}`]: { status: 404 } });
    await expect(new GcsStorageService('my-bucket', token, missing.impl).read(KEY)).rejects.toBeInstanceOf(StorageObjectNotFound);
  });

  it('delete ignores an object that is already gone', async () => {
    const f = fakeFetch({ [`DELETE ${objectUrl}`]: { status: 404 } });
    await expect(new GcsStorageService('my-bucket', token, f.impl).delete(KEY)).resolves.toBeUndefined();
  });

  it('only accepts server-generated keys (no path tricks)', async () => {
    const f = fakeFetch({});
    const s = new GcsStorageService('my-bucket', token, f.impl);
    await expect(s.save('../secrets.txt', Buffer.from('x'))).rejects.toThrow(/Invalid storage key/);
    await expect(s.read('work-orders/../../x.jpg')).rejects.toThrow(/Invalid storage key/);
    expect(f.calls).toHaveLength(0);
  });

  it('gets the token from the metadata server once, then reuses it until it nearly expires', async () => {
    const f = fakeFetch({
      'GET http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token': { status: 200, body: { access_token: 'abc', expires_in: 3600 } },
    });
    const source = metadataTokenSource(f.impl);
    expect(await source()).toBe('abc');
    expect(await source()).toBe('abc');
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].init?.headers).toEqual({ 'Metadata-Flavor': 'Google' });
  });

  it('STORAGE_DRIVER chooses the bucket; local disk stays the default', () => {
    expect(storageFromEnv({ STORAGE_DRIVER: 'gcs', GCS_BUCKET: 'b' })).toBeInstanceOf(GcsStorageService);
    expect(storageFromEnv({})).toBeInstanceOf(LocalStorageService);
    expect(() => storageFromEnv({ STORAGE_DRIVER: 'gcs' })).toThrow(/GCS_BUCKET/);
  });
});

describe('sign-in emails over SMTP', () => {
  let lines: string[];
  beforeEach(() => {
    lines = [];
    const capture = (msg: unknown) => {
      lines.push(String(msg));
    };
    jest.spyOn(Logger.prototype, 'log').mockImplementation(capture);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(capture);
  });
  afterEach(() => jest.restoreAllMocks());
  const settings = { host: 'smtp.gmail.com', port: 465, user: 'sender@gmail.com', password: 'app-password', from: 'LeaseLens <sender@gmail.com>' };

  it('sends the link to the address, from the configured sender, and logs neither', async () => {
    const sent: Record<string, unknown>[] = [];
    const mail = new SmtpMailService(settings, { sendMail: async (m: Record<string, unknown>) => (sent.push(m), {}) } as never);
    await mail.sendMagicLink('jordan@example.test', 'https://web.example/auth/verify?token=secret-token');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ from: settings.from, to: 'jordan@example.test', subject: 'Your LeaseLens sign-in link' });
    expect(String(sent[0].text)).toContain('https://web.example/auth/verify?token=secret-token');
    expect(lines.join('\n')).not.toMatch(/jordan|secret-token/);
  });

  it('a failure logs only the error code — never the address the SMTP server quoted', async () => {
    const failing = { sendMail: async () => Promise.reject(Object.assign(new Error('550 5.1.1 <jordan@example.test>: Recipient address rejected'), { code: 'EENVELOPE', responseCode: 550 })) };
    const mail = new SmtpMailService(settings, failing as never);
    await expect(mail.sendMagicLink('jordan@example.test', 'https://x/auth/verify?token=t')).rejects.toThrow('Sign-in email could not be sent (EENVELOPE 550)');
    expect(lines.join('\n')).not.toMatch(/jordan/);
  });

  it('SMTP is used only when host, user and password are all set; otherwise the console', () => {
    expect(mailServiceFromEnv({ SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'a@gmail.com', SMTP_PASSWORD: 'p' })).toBeInstanceOf(SmtpMailService);
    expect(mailServiceFromEnv({ SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'a@gmail.com' })).toBeInstanceOf(ConsoleMailService);
    expect(mailServiceFromEnv({})).toBeInstanceOf(ConsoleMailService);
  });
});

describe('client IP check for TRUST_PROXY', () => {
  it('masks addresses so they can tell hops apart but not identify anyone', () => {
    expect(maskIp('203.0.113.45')).toBe('203.0.x.x');
    expect(maskIp('::ffff:198.51.100.7')).toBe('198.51.x.x');
    expect(maskIp('2001:db8:85a3::8a2e:370:7334')).toBe('2001:db8:…');
    expect(maskIp(undefined)).toBe('(none)');
  });

  it('logs the forwarded chain once (skipping /health), then stays quiet', () => {
    const logged: string[] = [];
    const probe = clientIpProbe({ log: (m: string) => logged.push(m) } as unknown as Logger);
    const req = (path: string) => ({ path, headers: { 'x-forwarded-for': '203.0.113.45, 198.51.100.7' }, socket: { remoteAddress: '169.254.1.1' }, ip: '198.51.100.7' }) as never;
    const next = jest.fn();
    probe(req('/health'), {} as never, next);
    probe(req('/auth/request-link'), {} as never, next);
    probe(req('/auth/request-link'), {} as never, next);
    expect(next).toHaveBeenCalledTimes(3);
    expect(logged).toEqual(['X-Forwarded-For has 2 entries [203.0.x.x, 198.51.x.x]; socket 169.254.x.x; TRUST_PROXY=0 → client 198.51.x.x']);
  });
});
