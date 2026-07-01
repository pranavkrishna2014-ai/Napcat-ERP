import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { AppRole } from '../decorators/roles.decorator';

function contextFor(
  roles: string[],
  required: AppRole[] | undefined,
): { ctx: ExecutionContext; reflector: Reflector } {
  const reflector = {
    getAllAndOverride: () => required,
  } as unknown as Reflector;
  const ctx = {
    switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  return { ctx, reflector };
}

describe('RolesGuard', () => {
  it('allows when no roles are required', () => {
    const { ctx, reflector } = contextFor(['OPERATOR'], undefined);
    expect(new RolesGuard(reflector).canActivate(ctx)).toBe(true);
  });

  it('allows a user holding a required role', () => {
    const { ctx, reflector } = contextFor(['PLANNER'], [AppRole.PLANNER]);
    expect(new RolesGuard(reflector).canActivate(ctx)).toBe(true);
  });

  it('ADMIN passes any role requirement', () => {
    const { ctx, reflector } = contextFor(['ADMIN'], [AppRole.QC]);
    expect(new RolesGuard(reflector).canActivate(ctx)).toBe(true);
  });

  it('denies a user lacking the required role', () => {
    const { ctx, reflector } = contextFor(['OPERATOR'], [AppRole.PLANNER]);
    expect(() => new RolesGuard(reflector).canActivate(ctx)).toThrow(
      ForbiddenException,
    );
  });
});
