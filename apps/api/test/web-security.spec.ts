/**
 * The web app's Content-Security-Policy (built in packages/shared, set per request by apps/web/src/proxy.ts).
 * The web app has no test runner, so the policy is tested here.
 */
import { contentSecurityPolicy } from '@leaselens/shared';

const directives = (csp: string) =>
  Object.fromEntries(csp.split('; ').map((d) => [d.split(' ')[0], d.split(' ').slice(1)])) as Record<string, string[]>;

describe('web Content-Security-Policy', () => {
  const prod = directives(contentSecurityPolicy({ nonce: 'abc123', apiOrigin: 'https://api.leaselens.example', dev: false }));
  const dev = directives(contentSecurityPolicy({ nonce: 'abc123', apiOrigin: 'http://localhost:4100', dev: true }));

  it('only runs scripts with this request’s nonce — no inline or eval in production', () => {
    expect(prod['script-src']).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    expect(prod['script-src']).not.toContain("'unsafe-inline'");
    expect(prod['script-src']).not.toContain("'unsafe-eval'");
  });

  it('talks only to itself and the API, and loads photos only from there', () => {
    expect(prod['connect-src']).toEqual(["'self'", 'https://api.leaselens.example']);
    expect(prod['img-src']).toEqual(["'self'", 'blob:', 'data:', 'https://api.leaselens.example']);
    expect(prod['default-src']).toEqual(["'self'"]);
  });

  it('cannot be framed, has no plugins, and forms and <base> stay on the site', () => {
    expect(prod['frame-ancestors']).toEqual(["'none'"]);
    expect(prod['object-src']).toEqual(["'none'"]);
    expect(prod['form-action']).toEqual(["'self'"]);
    expect(prod['base-uri']).toEqual(["'self'"]);
  });

  it('upgrades http:// requests when deployed over HTTPS only', () => {
    expect(prod).toHaveProperty('upgrade-insecure-requests');
    expect(directives(contentSecurityPolicy({ nonce: 'n', apiOrigin: 'http://localhost:4100', dev: false }))).not.toHaveProperty(
      'upgrade-insecure-requests',
    );
  });

  it('deployed with the API behind /api on the same origin: only "self", and http:// is upgraded', () => {
    const same = directives(contentSecurityPolicy({ nonce: 'n', apiOrigin: null, dev: false }));
    expect(same['connect-src']).toEqual(["'self'"]);
    expect(same['img-src']).toEqual(["'self'", 'blob:', 'data:']);
    expect(same).toHaveProperty('upgrade-insecure-requests');
  });

  it('development adds only what hot reload and React debugging need', () => {
    expect(dev['script-src']).toContain("'unsafe-eval'");
    expect(dev['connect-src']).toEqual(["'self'", 'http://localhost:4100', 'ws:', 'wss:']);
  });
});
