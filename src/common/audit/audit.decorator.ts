import { SetMetadata } from '@nestjs/common';

export const AUDIT_ENTITY_KEY = 'auditEntity';

/**
 * Tags a controller (or handler) with the entity type recorded in the audit
 * log for its mutations, e.g. `@Audit('Material')`. If omitted, the audit
 * interceptor falls back to the controller's route path.
 */
export const Audit = (entityType: string) =>
  SetMetadata(AUDIT_ENTITY_KEY, entityType);
