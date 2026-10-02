import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  homePathForRole,
  INVALID_LINK_MESSAGE,
  MAGIC_LINK_TTL_MINUTES,
  SESSION_TTL_DAYS,
} from '@leaselens/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './auth.types';
import { MailService } from './mail.service';
import { generateToken, hashToken } from './tokens';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** Max sign-in links per email per 15 minutes. Extra requests are silently ignored. */
export const LINKS_PER_EMAIL_WINDOW = 3;

const toAuthUser = (u: AuthUser): AuthUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  unitId: u.unitId,
  vendorId: u.vendorId,
});

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /**
   * Starts sign-in for an email. The caller sends the same response whether or not the account
   * exists, and the work runs in the background so response time doesn't reveal it either.
   */
  requestLink(email: string): void {
    this.issueLink(email).catch((err: unknown) =>
      this.logger.error(`Could not issue sign-in link: ${err instanceof Error ? err.message : String(err)}`),
    );
  }

  private async issueLink(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;

    const now = new Date();
    const recent = await this.prisma.magicLinkToken.count({
      where: { userId: user.id, createdAt: { gt: new Date(now.getTime() - MAGIC_LINK_TTL_MINUTES * MINUTE) } },
    });
    if (recent >= LINKS_PER_EMAIL_WINDOW) {
      this.logger.warn(`Sign-in link limit reached for user ${user.id}`);
      return;
    }

    const token = generateToken();
    await this.prisma.magicLinkToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + MAGIC_LINK_TTL_MINUTES * MINUTE),
      },
    });
    const webUrl = process.env.WEB_URL ?? 'http://localhost:3000';
    await this.mail.sendMagicLink(email, `${webUrl}/auth/verify?token=${encodeURIComponent(token)}`);
  }

  /** Uses a magic link once and starts a session. Expired, used and unknown links all fail the same way. */
  async verifyLink(token: string) {
    const tokenHash = hashToken(token);
    const now = new Date();

    // Atomic: only one request can flip usedAt from null, and only before expiry.
    const { count } = await this.prisma.magicLinkToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (count !== 1) throw new BadRequestException(INVALID_LINK_MESSAGE);

    const link = await this.prisma.magicLinkToken.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!link) throw new BadRequestException(INVALID_LINK_MESSAGE);

    const sessionToken = generateToken();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * DAY);
    await this.prisma.session.create({
      data: { userId: link.userId, tokenHash: hashToken(sessionToken), expiresAt },
    });

    const user = toAuthUser(link.user);
    return { sessionToken, expiresAt, user, redirectTo: homePathForRole(user.role) };
  }

  /** The user for a session cookie, or null if missing or expired. Checked on every request. */
  async userForSession(sessionToken: string): Promise<AuthUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(sessionToken) },
      include: { user: true },
    });
    if (!session) return null;
    if (session.expiresAt <= new Date()) {
      await this.prisma.session.deleteMany({ where: { id: session.id } });
      return null;
    }
    return toAuthUser(session.user);
  }

  /** Sign-out deletes the session row. */
  async logout(sessionToken: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash: hashToken(sessionToken) } });
  }
}
