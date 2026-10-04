import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  DEMO_ACCOUNTS,
  REQUEST_LINK_MESSAGE,
  RequestLinkSchema,
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
  VerifyLinkSchema,
  type DemoInfo,
  type Me,
  type RequestLinkResponse,
  type VerifyLinkResponse,
} from '@leaselens/shared';
import type { CookieOptions, Request, Response } from 'express';
import { parseBody } from '../common/parse-body';
import { isDemoMode } from '../config/demo';
import { AuthService } from './auth.service';
import type { AuthUser } from './auth.types';
import { ALL_ROLES, CurrentUser, Public, Roles } from './decorators';

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
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 15 * MINUTE } })
  @Post('auth/request-link')
  @HttpCode(200)
  async requestLink(@Body() body: unknown): Promise<RequestLinkResponse> {
    const { email } = parseBody(RequestLinkSchema, body, 'Enter a valid email address.');
    const { demoSignInUrl } = await this.auth.requestLink(email);
    // Outside demo mode (and for unknown emails) this is always exactly { message }.
    return demoSignInUrl ? { message: REQUEST_LINK_MESSAGE, demo: { signInUrl: demoSignInUrl } } : { message: REQUEST_LINK_MESSAGE };
  }

  /** Whether demo mode is on and, only then, the demo accounts for the sign-in page. */
  @Public()
  @Get('auth/demo')
  demo(): DemoInfo {
    return isDemoMode() ? { enabled: true, accounts: [...DEMO_ACCOUNTS] } : { enabled: false };
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
