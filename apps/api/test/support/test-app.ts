import 'reflect-metadata';
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
import { FakePrisma } from './fake-prisma';

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
  /** Creates a session directly and returns the cookie header for it. */
  signInAs: (role: Role, opts?: { expiresAt?: Date }) => string;
}

export async function createTestApp(extraControllers: Type[] = []): Promise<TestApp> {
  const db = new FakePrisma();
  const mail = new FakeMail();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [TestRoutesController, ...extraControllers],
  })
    .overrideProvider(PrismaService)
    .useValue(db)
    .overrideProvider(MailService)
    .useValue(mail)
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();

  const signInAs = (role: Role, opts: { expiresAt?: Date } = {}) => {
    const user = db.addUser(`${role.toLowerCase()}-${db.users.length}@leaselens.test`, role);
    const token = generateToken();
    db.sessions.push({
      id: `sess_direct_${db.sessions.length}`,
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      createdAt: new Date(),
    });
    return `${SESSION_COOKIE}=${token}`;
  };

  return { app, db, mail, signInAs };
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
