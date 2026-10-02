import request from 'supertest';
import { HealthResponseSchema } from '@leaselens/shared';
import { createTestApp, type TestApp } from './support/test-app';

describe('GET /health', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('returns 200 with a valid health payload, without signing in', async () => {
    const res = await request(t.app.getHttpServer()).get('/health').expect(200);
    expect(HealthResponseSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.status).toBe('ok');
  });

  it('sets security headers via Helmet', async () => {
    const res = await request(t.app.getHttpServer()).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('returns JSON without a stack trace for unknown routes', async () => {
    // Unknown routes never reach a controller, so the guards don't run and Nest answers 404.
    const res = await request(t.app.getHttpServer()).get('/does-not-exist').expect(404);
    expect(res.body.statusCode).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts/);
  });
});
