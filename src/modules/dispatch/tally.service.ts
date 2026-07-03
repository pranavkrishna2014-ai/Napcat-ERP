import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { WarrantyService } from '../warranty/warranty.service';

/**
 * Tally invoice import — the ONE piece of data crossing from Tally into the ERP.
 * It carries only invoice number/date, dealer, customer and the serials sold —
 * no amounts, no GST, no ledgers. On import each serial's warranty is activated
 * (start date = invoice date). No accounting ever enters the ERP.
 */
@Injectable()
export class TallyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly warranty: WarrantyService,
  ) {}

  async importInvoice(input: {
    invoiceNumber: string;
    invoiceDate: Date;
    dealerId?: string;
    customerName?: string;
    serials: string[];
  }): Promise<{
    invoiceId: string;
    activated: number;
    unmatchedSerials: string[];
  }> {
    if (!input.serials?.length) {
      throw new BadRequestException('Invoice import needs at least one serial');
    }

    // Resolve/create the customer (name only — full CRM stays in Tally).
    let customerId: string | undefined;
    if (input.customerName?.trim()) {
      const existing = await this.prisma.customer.findFirst({
        where: { name: input.customerName.trim() },
      });
      customerId =
        existing?.id ??
        (await this.prisma.customer.create({
          data: { name: input.customerName.trim() },
        })).id;
    }

    const invoice = await this.prisma.tallyInvoice.upsert({
      where: { invoiceNumber: input.invoiceNumber },
      update: {},
      create: {
        invoiceNumber: input.invoiceNumber,
        invoiceDate: input.invoiceDate,
        dealerId: input.dealerId,
        customerName: input.customerName,
        lines: {
          create: input.serials.map((serial) => ({ serial, quantity: 1 })),
        },
      },
    });

    // Activate a warranty per serial; collect any serial we don't recognise.
    const unmatchedSerials: string[] = [];
    let activated = 0;
    for (const serial of input.serials) {
      const w = await this.warranty.activateFromInvoice({
        serial,
        invoiceId: invoice.id,
        invoiceDate: input.invoiceDate,
        dealerId: input.dealerId,
        customerId,
      });
      if (w) activated++;
      else unmatchedSerials.push(serial);
    }

    return { invoiceId: invoice.id, activated, unmatchedSerials };
  }
}
