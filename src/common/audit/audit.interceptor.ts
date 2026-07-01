import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';
import { AUDIT_ENTITY_KEY } from './audit.decorator';

const METHOD_ACTION: Record<string, string> = {
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
};

/**
 * Global interceptor that records every successful mutating request
 * (POST/PUT/PATCH/DELETE) to the audit log — the user, the action, the entity
 * type and id, and the (sanitized) request body. Read requests are ignored.
 * Failures are never audited (the observable errors before tap runs).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const action = METHOD_ACTION[request.method];

    // Only audit mutations.
    if (!action) return next.handle();

    const entityType =
      this.reflector.getAllAndOverride<string>(AUDIT_ENTITY_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ??
      context.getClass().name.replace(/Controller$/, '');

    return next.handle().pipe(
      tap((result) => {
        const entityId =
          (result && typeof result === 'object' && 'id' in result
            ? (result as { id?: string }).id
            : undefined) ?? request.params?.id;

        // Fire-and-forget; a logging failure must not break the request.
        void this.audit
          .record({
            userId: request.user?.id,
            action,
            entityType,
            entityId,
            changes: request.body,
            ipAddress: request.ip,
          })
          .catch(() => undefined);
      }),
    );
  }
}
