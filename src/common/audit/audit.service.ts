import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { sanitize } from './sanitize';

export interface AuditEntry {
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  changes?: unknown;
  ipAddress?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        changes: sanitize(entry.changes) as never,
        ipAddress: entry.ipAddress,
      },
    });
  }
}
