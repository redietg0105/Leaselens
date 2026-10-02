import 'reflect-metadata';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Controller, Get, type INestApplication, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SESSION_COOKIE } from '@leaselens/shared';
import type { Role } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { MailService } from '../../src/auth/mail.service';
import { generateToken, hashToken } from '../../src/auth/tokens';
import { Roles, STAFF } from '../../src/auth/decorators';
import { configureApp } from '../../src/configure-app';
import { PrismaService } from '../../src/prisma/prisma.service';
import { LocalStorageService, StorageService } from '../../src/storage/storage.service';
import { TriageModel } from '../../src/triage/triage-model';
import { TRIAGE_TIMEOUT_MS } from '../../src/triage/triage.service';
import { FakePrisma, type FakeUser } from './fake-prisma';
import { FakeTriageModel } from './fake-triage-model';

/** Captures sign-in emails instead of printing them. */
export class FakeMail {
  sent: { email: string; url: string }[] = [];
  async sendMagicLink(email: string, url: string) {
    this.sent.push({ email, url });
  }
  tokenFor(email: string): string {
    const msg = [...this.sent].reverse().find((m) => m.email === email);
    if (!msg) throw new Error(`No sign-in email for ${email}`);
    return new URL(msg.url).searchParams.get('token')!;
  }
}

/** Test-only routes: one staff-only, one that forgot to declare roles. */
@Controller('test')
class TestRoutesController {
  @Roles(...STAFF)
  @Get('staff-only')
  staffOnly() {
    return { ok: true };
  }

  @Get('no-policy')
  noPolicy() {
    return { ok: true };
  }
}

export interface TestApp {
  app: INestApplication;
  db: FakePrisma;
  mail: FakeMail;
  /** Fake Gemini: inspect .requests, change .respond. */
  model: FakeTriageModel;
  /** Temporary folder standing in for uploads/. Deleted by close(). */
  uploadsDir: string;
  /** Creates a user + session directly; returns the user and the cookie header. */
  signIn: (role: Role, opts?: { expiresAt?: Date; unitId?: string | null }) => { user: FakeUser; cookie: string };
  /** Shorthand for signIn(...).cookie. */
  signInAs: (role: Role, opts?: { expiresAt?: Date; unitId?: string | null }) => string;
  close: () => Promise<void>;
}

export async function createTestApp(
  extraControllers: Type[] = [],
  opts: { triageTimeoutMs?: number } = {},
): Promise<TestApp> {
  const db = new FakePrisma();
  const mail = new FakeMail();
  const model = new FakeTriageModel();
  const uploadsDir = mkdtempSync(path.join(tmpdir(), 'leaselens-uploads-'));
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [TestRoutesController, ...extraControllers],
  })
    .overrideProvider(PrismaService)
    .useValue(db)
    .overrideProvider(MailService)
    .useValue(mail)
    .overrideProvider(TriageModel)
    .useValue(model)
    .overrideProvider(TRIAGE_TIMEOUT_MS)
    .useValue(opts.triageTimeoutMs ?? 15_000)
    .overrideProvider(StorageService)
    .useValue(new LocalStorageService(uploadsDir))
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();

  const signIn = (role: Role, opts: { expiresAt?: Date; unitId?: string | null } = {}) => {
    const user = db.addUser(`${role.toLowerCase()}-${db.users.length}@leaselens.test`, role, undefined, opts.unitId ?? null);
    const token = generateToken();
    db.sessions.push({
      id: `sess_direct_${db.sessions.length}`,
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      createdAt: new Date(),
    });
    return { user, cookie: `${SESSION_COOKIE}=${token}` };
  };
  const signInAs: TestApp['signInAs'] = (role, opts) => signIn(role, opts).cookie;

  const close = async () => {
    await app.close();
    rmSync(uploadsDir, { recursive: true, force: true });
  };

  return { app, db, mail, model, uploadsDir, signIn, signInAs, close };
}

/** Wait for background work (request-link issues tokens without blocking the response). */
export async function waitFor(condition: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** Let any background work finish (used when we expect nothing to happen). */
export const settle = () => new Promise((r) => setTimeout(r, 50));
