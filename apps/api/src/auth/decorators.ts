import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';
import type { Request } from 'express';
import type { AuthUser } from './auth.types';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** No sign-in needed. Use sparingly. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Roles allowed to call this route. Every non-public route must declare this. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const ALL_ROLES: Role[] = ['TENANT', 'VENDOR', 'COORDINATOR', 'LEASING', 'MANAGER'];
export const STAFF: Role[] = ['COORDINATOR', 'LEASING', 'MANAGER'];

/** The signed-in user (from the session, never from the request body). */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<Request>().user;
  if (!user) throw new Error('CurrentUser used on a route without SessionGuard');
  return user;
});
