import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HealthResponseSchema } from '@leaselens/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

describe('GET /health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with a valid health payload', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(HealthResponseSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.status).toBe('ok');
  });

  it('sets security headers via Helmet', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('returns JSON 404 without a stack trace for unknown routes', async () => {
    const res = await request(app.getHttpServer()).get('/does-not-exist').expect(404);
    expect(res.body.statusCode).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts/);
  });
});
