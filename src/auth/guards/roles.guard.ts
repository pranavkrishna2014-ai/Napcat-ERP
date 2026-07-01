import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppRole, ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Authorization guard. Runs after JwtAuthGuard. If a route declares required
 * roles via `@Roles(...)`, the user must hold at least one of them. ADMIN is a
 * super-role that always passes.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const roles: string[] = request.user?.roles ?? [];

    if (roles.includes(AppRole.ADMIN)) return true;
    if (roles.some((r) => required.includes(r as AppRole))) return true;

    throw new ForbiddenException(
      `Requires one of roles: ${required.join(', ')}`,
    );
  }
}
