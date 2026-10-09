import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  homePathForRole,
  INVALID_LINK_MESSAGE,
  LINKS_PER_EMAIL_WINDOW,
  MAGIC_LINK_TTL_MINUTES,
  SESSION_TTL_DAYS,
  type ReviewerRole,
} from '@leaselens/shared';
import { isDemoRequest } from '../config/demo';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './auth.types';
import { errorText } from '../common/error-text';
import { MailService } from './mail.service';
import { REVIEWER_USER_IDS } from './reviewer';
import { generateToken, hashToken } from './tokens';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** What happened to a link request (never shown outside demo mode). */
type IssueResult = { url: string } | { url: null; reason: 'unknown' | 'limit' };

export const REVIEWER_UNAVAILABLE_MESSAGE = 'Reviewer access is not available right now.';

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
  async requestLink(email: string, clientAddress?: string): Promise<{ demoSignInUrl?: string; demoLimitReached?: true }> {
    const failed = (err: unknown): IssueResult => {
      this.logger.error(`Could not issue sign-in link: ${errorText(err)}`);
      return { url: null, reason: 'unknown' };
    };
    if (isDemoRequest(clientAddress)) {
      // Demo mode (local only): wait for the link so the browser can show it. Unknown emails get no
      // link — the same response as outside demo mode. A known account over the per-email limit is
      // told so (demo mode already reveals which accounts exist), instead of a dead-end "Check your email".
      const result = await this.issueLink(email).catch(failed);
      if (result.url !== null) return { demoSignInUrl: result.url };
      return result.reason === 'limit' ? { demoLimitReached: true } : {};
    }
    void this.issueLink(email).catch(failed);
    return {};
  }

  /** Creates and "emails" a link for a known account. Returns the link, or why none was issued. */
  private async issueLink(email: string): Promise<IssueResult> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return { url: null, reason: 'unknown' };

    const now = new Date();
    const recent = await this.prisma.magicLinkToken.count({
      where: { userId: user.id, createdAt: { gt: new Date(now.getTime() - MAGIC_LINK_TTL_MINUTES * MINUTE) } },
    });
    if (recent >= LINKS_PER_EMAIL_WINDOW) {
      this.logger.warn(`Sign-in link limit reached for user ${user.id}`);
      return { url: null, reason: 'limit' };
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
    const url = `${webUrl}/auth/verify?token=${encodeURIComponent(token)}`;
    await this.mail.sendMagicLink(email, url);
    return { url };
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

    return this.startSession(toAuthUser(link.user));
  }

  /**
   * Reviewer access: signs in to the fixed seeded demo account for a role (the code was already checked).
   * Refuses if that seeded account is missing or no longer has the role — never falls back to another account.
   */
  async reviewerSignIn(role: ReviewerRole) {
    const row = await this.prisma.user.findUnique({ where: { id: REVIEWER_USER_IDS[role] } });
    if (!row || row.id !== REVIEWER_USER_IDS[role] || row.role !== role) {
      this.logger.warn(`Reviewer sign-in: no seeded ${role} account`);
      throw new NotFoundException(REVIEWER_UNAVAILABLE_MESSAGE);
    }
    const user = toAuthUser(row);
    const session = await this.startSession(user);
    // Role only: no code, address or browser details.
    await this.prisma.auditLog.create({
      data: { actorId: user.id, action: 'auth.reviewer_signin', entity: 'User', entityId: user.id, after: { role } },
    });
    this.logger.log(`Reviewer sign-in as ${role}`);
    return session;
  }

  /** A new session for a user (the same for emailed links and reviewer access). */
  private async startSession(user: AuthUser) {
    const sessionToken = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * DAY);
    await this.prisma.session.create({
      data: { userId: user.id, tokenHash: hashToken(sessionToken), expiresAt },
    });
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
