import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { computeExpiry } from './warranty-dates';
import { validateClaim } from './claim-validation';

export interface ActivateInput {
  serial: string;
  invoiceId: string;
  invoiceDate: Date;
  dealerId?: string | null;
  customerId?: string | null;
}

/**
 * Warranty activation and claims.
 *
 * Warranty is dormant (PENDING_ACTIVATION) at manufacture and becomes ACTIVE
 * only when a Tally invoice is synced: start date = invoice date, expiry =
 * model policy duration. Claims validate serial, activation, period, dealer and
 * prior replacement history before they can be opened.
 */
@Injectable()
export class WarrantyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Activate (or refresh) the warranty for one invoiced serial. Returns the
   * warranty, or null if the serial is unknown (import skips it and reports it).
   */
  async activateFromInvoice(input: ActivateInput): Promise<unknown | null> {
    const sn = await this.prisma.serialNumber.findUnique({
      where: { serial: input.serial },
      include: {
        finishedGood: {
          include: {
            variant: { include: { model: { include: { warrantyPolicy: true } } } },
          },
        },
      },
    });
    if (!sn) return null;

    const policy = (sn.finishedGood as Record<string, unknown> | null)
      ? ((sn.finishedGood as Record<string, unknown>).variant as Record<string, unknown>)
      : null;
    const warrantyPolicy = policy
      ? ((policy.model as Record<string, unknown>).warrantyPolicy as
          | { durationMonths: number }
          | null)
      : null;

    const startDate = input.invoiceDate;
    const expiryDate = warrantyPolicy
      ? computeExpiry(startDate, Number(warrantyPolicy.durationMonths))
      : null;

    return this.prisma.warranty.upsert({
      where: { serialNumberId: sn.id },
      update: {
        invoiceId: input.invoiceId,
        dealerId: input.dealerId ?? undefined,
        customerId: input.customerId ?? undefined,
        status: 'ACTIVE',
        startDate,
        expiryDate,
        activatedAt: new Date(),
      },
      create: {
        serialNumberId: sn.id,
        invoiceId: input.invoiceId,
        dealerId: input.dealerId ?? undefined,
        customerId: input.customerId ?? undefined,
        status: 'ACTIVE',
        startDate,
        expiryDate,
        activatedAt: new Date(),
      },
    });
  }

  async getBySerial(serial: string): Promise<Record<string, unknown>> {
    const sn = await this.prisma.serialNumber.findUnique({
      where: { serial },
      include: { warranty: { include: { claims: true, invoice: true } } },
    });
    if (!sn) throw new NotFoundException(`Serial ${serial} not found`);
    if (!sn.warranty) {
      throw new NotFoundException(
        `No warranty for ${serial} yet (awaiting invoice sync)`,
      );
    }
    return sn.warranty as Record<string, unknown>;
  }

  /** Active warranties expiring within `days` (default 90). */
  listExpiring(days = 90) {
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return this.prisma.warranty.findMany({
      where: { status: 'ACTIVE', expiryDate: { lte: cutoff } },
      orderBy: { expiryDate: 'asc' },
      include: { serialNumber: true, dealer: true },
      take: 500,
    });
  }

  /** File a claim after validating it against the warranty and history. */
  async fileClaim(input: {
    serial: string;
    dealerId?: string;
    customerId?: string;
    reason: string;
    now?: Date;
  }): Promise<unknown> {
    const sn = await this.prisma.serialNumber.findUnique({
      where: { serial: input.serial },
      include: { warranty: { include: { claims: true } } },
    });

    const warranty = sn?.warranty as Record<string, unknown> | undefined;
    const claims = (warranty?.claims as Array<{ status: string }>) ?? [];

    const validation = validateClaim({
      serialFound: !!sn,
      warrantyStatus: warranty?.status as never,
      expiryDate: (warranty?.expiryDate as Date) ?? null,
      warrantyDealerId: (warranty?.dealerId as string) ?? null,
      claimDealerId: input.dealerId ?? null,
      alreadyReplaced: claims.some((c) => c.status === 'REPLACED'),
      now: input.now,
    });
    if (!validation.ok) {
      throw new BadRequestException({
        message: 'Claim rejected',
        reasons: validation.reasons,
      });
    }

    return this.prisma.warrantyClaim.create({
      data: {
        claimNumber: `CLM-${Date.now()}`,
        warrantyId: warranty!.id as string,
        dealerId: input.dealerId,
        customerId: input.customerId,
        status: 'OPEN',
        reason: input.reason,
      },
    });
  }

  /** Approve / reject / replace a claim. */
  async decideClaim(
    id: string,
    decision: 'APPROVED' | 'REJECTED' | 'REPLACED',
    replacementSerial?: string,
    userId?: string,
  ): Promise<unknown> {
    const claim = await this.prisma.warrantyClaim.findUnique({ where: { id } });
    if (!claim) throw new NotFoundException('Claim not found');
    if (decision === 'REPLACED' && !replacementSerial) {
      throw new BadRequestException(
        'A replacement serial is required to mark a claim REPLACED',
      );
    }
    return this.prisma.warrantyClaim.update({
      where: { id },
      data: {
        status: decision,
        replacementSerial: decision === 'REPLACED' ? replacementSerial : undefined,
        resolvedAt: new Date(),
      },
    });
  }

  listClaims(status?: string) {
    return this.prisma.warrantyClaim.findMany({
      where: { status: status as never },
      orderBy: { reportedAt: 'desc' },
      include: { warranty: { include: { serialNumber: true } }, dealer: true },
      take: 300,
    });
  }
}
