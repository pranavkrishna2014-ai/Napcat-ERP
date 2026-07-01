import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** The authenticated user attached to the request by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  username: string;
  roles: string[];
}

/** Injects the current authenticated user into a handler parameter. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
