import { SetMetadata } from '@nestjs/common';

/** Canonical role names used across the ERP. */
export enum AppRole {
  ADMIN = 'ADMIN',
  PLANNER = 'PLANNER',
  STORE = 'STORE',
  OPERATOR = 'OPERATOR',
  QC = 'QC',
}

export const ROLES_KEY = 'roles';

/**
 * Restrict a route (or controller) to the given roles. ADMIN always passes.
 * Usage: `@Roles(AppRole.PLANNER, AppRole.STORE)`
 */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
