import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import type { Request } from 'express';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators';

/**
 * Deny by default: a route must be @Public() or list its roles with @Roles(...).
 * The role comes from the database via SessionGuard, never from the client.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    const req = context.switchToHttp().getRequest<Request>();
    if (!roles?.length) {
      this.logger.error(`Route ${req.method} ${req.path} has no @Roles() — denied`);
      throw new ForbiddenException('You do not have access to this.');
    }
    if (!req.user || !roles.includes(req.user.role)) {
      throw new ForbiddenException('You do not have access to this.');
    }
    return true;
  }
}
