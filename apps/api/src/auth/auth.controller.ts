import { Body, Controller, ForbiddenException, Get, HttpCode, HttpException, HttpStatus, Logger, NotFoundException, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  DEMO_ACCOUNTS,
  REQUEST_LINK_MESSAGE,
  RequestLinkSchema,
  REVIEWER_LIMIT_MESSAGE,
  ReviewerSignInSchema,
  WRONG_REVIEWER_CODE_MESSAGE,
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
  VerifyLinkSchema,
  type DemoInfo,
  type Me,
  type RequestLinkResponse,
  type ReviewerInfo,
  type VerifyLinkResponse,
} from '@leaselens/shared';
import type { CookieOptions, Request, Response } from 'express';
import { parseBody } from '../common/parse-body';
import { isDemoRequest } from '../config/demo';
import { AuthService, REVIEWER_UNAVAILABLE_MESSAGE } from './auth.service';
import type { AuthUser } from './auth.types';
import { ALL_ROLES, CurrentUser, Public, Roles } from './decorators';
import { codeMatches, reviewerCode, WrongCodeLimiter } from './reviewer';

const MINUTE = 60 * 1000;

/**
 * httpOnly + SameSite=Lax. localhost:3000 and localhost:4100 are the same site (ports are ignored),
 * so the browser sends this cookie on credentialed fetches from the web app to the API.
 */
export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

const toMe = (u: AuthUser): Me => ({ id: u.id, name: u.name, email: u.email, role: u.role });

@Controller()
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  /** Wrong reviewer access codes, per address and overall (in memory; the API runs as one instance). */
  private readonly reviewerLimiter = new WrongCodeLimiter();

  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 15 * MINUTE } })
  @Post('auth/request-link')
  @HttpCode(200)
  async requestLink(@Body() body: unknown, @Req() req: Request): Promise<RequestLinkResponse> {
    const { email } = parseBody(RequestLinkSchema, body, 'Enter a valid email address.');
    const { demoSignInUrl, demoLimitReached } = await this.auth.requestLink(email, req.ip);
    // Outside demo mode (and for unknown emails) this is always exactly { message }.
    if (demoSignInUrl) return { message: REQUEST_LINK_MESSAGE, demo: { signInUrl: demoSignInUrl } };
    if (demoLimitReached) return { message: REQUEST_LINK_MESSAGE, demo: { limitReached: true } };
    return { message: REQUEST_LINK_MESSAGE };
  }

  /** Whether demo mode is on (for this local client) and, only then, the demo accounts for the sign-in page. */
  @Public()
  @Get('auth/demo')
  demo(@Req() req: Request): DemoInfo {
    return isDemoRequest(req.ip) ? { enabled: true, accounts: [...DEMO_ACCOUNTS] } : { enabled: false };
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: MINUTE } })
  @Post('auth/verify')
  @HttpCode(200)
  async verify(@Body() body: unknown, @Res({ passthrough: true }) res: Response): Promise<VerifyLinkResponse> {
    const { token } = parseBody(VerifyLinkSchema, body, 'This sign-in link is invalid or has expired.');
    const result = await this.auth.verifyLink(token);
    res.cookie(SESSION_COOKIE, result.sessionToken, {
      ...sessionCookieOptions(),
      maxAge: SESSION_TTL_DAYS * 24 * 60 * MINUTE,
    });
    return { user: toMe(result.user), redirectTo: result.redirectTo };
  }

  /** Whether the sign-in page should show "Reviewer access". */
  @Public()
  @Get('auth/reviewer')
  reviewer(): ReviewerInfo {
    return { enabled: reviewerCode() !== null };
  }

  /**
   * Reviewer access: the access code plus a role signs in to that role's seeded demo account. Off → 404, as
   * if the route did not exist. The code is never logged or stored. Wrong codes are limited by
   * WrongCodeLimiter; the throttle below also caps all attempts, right or wrong.
   */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 15 * MINUTE } })
  @Post('auth/reviewer')
  @HttpCode(200)
  async reviewerSignIn(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<VerifyLinkResponse> {
    const expected = reviewerCode();
    if (expected === null) throw new NotFoundException(REVIEWER_UNAVAILABLE_MESSAGE);
    const { code, role } = parseBody(ReviewerSignInSchema, body);

    const address = req.ip ?? 'unknown';
    const blocked = this.reviewerLimiter.blocked(address);
    if (blocked) {
      if (blocked === 'overall') this.logger.warn('Reviewer sign-in paused: too many wrong codes from all addresses');
      throw new HttpException(REVIEWER_LIMIT_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!codeMatches(code, expected)) {
      this.reviewerLimiter.recordWrong(address);
      this.logger.warn('Reviewer sign-in: wrong code');
      throw new ForbiddenException(WRONG_REVIEWER_CODE_MESSAGE);
    }

    const result = await this.auth.reviewerSignIn(role);
    res.cookie(SESSION_COOKIE, result.sessionToken, {
      ...sessionCookieOptions(),
      maxAge: SESSION_TTL_DAYS * 24 * 60 * MINUTE,
    });
    return { user: toMe(result.user), redirectTo: result.redirectTo };
  }

  /** Public so signing out always works, even with an expired session. */
  @Public()
  @Post('auth/logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string') await this.auth.logout(token);
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    return { ok: true };
  }

  @Roles(...ALL_ROLES)
  @Get('me')
  me(@CurrentUser() user: AuthUser): Me {
    return toMe(user);
  }
}
