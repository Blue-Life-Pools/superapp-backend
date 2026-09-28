import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { APP_ROLES_KEY, AppRole, IS_PUBLIC_KEY } from './auth.constants';
import { AuthService, AuthenticatedUser } from './auth.service';

export type AuthenticatedRequest = Request & { appUser?: AuthenticatedUser };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.auth.session(request.headers.authorization);
    request.appUser = user;

    const roles = this.reflector.getAllAndOverride<AppRole[]>(APP_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles?.length && user.role !== 'SUPER_ADMIN' && !roles.includes(user.role)) {
      throw new ForbiddenException('This account cannot access this section.');
    }
    return true;
  }
}
