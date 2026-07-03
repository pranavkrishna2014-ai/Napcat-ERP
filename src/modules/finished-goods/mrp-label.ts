/**
 * MRP label payload — pure and unit-tested.
 *
 * The label is what the operator prints and sticks on the mattress. It carries
 * the serial (as a scannable payload), the product identity, the size and the
 * warranty terms. Rendering/printing is a client concern; this builds the data.
 */

export interface MrpLabelInput {
  serial: string;
  brandName: string;
  modelName: string;
  variantName?: string;
  length: number;
  width: number;
  height: number;
  manufacturedOn: Date;
  mrp?: number;
  warrantyMonths?: number;
}

export interface MrpLabel {
  serial: string;
  brand: string;
  model: string;
  variant?: string;
  size: string;
  manufacturedOn: string;
  mrp: number | null;
  warranty: string | null;
  /** Compact payload for the QR / barcode; scanning it returns the serial. */
  scanPayload: string;
}

export function buildMrpLabel(input: MrpLabelInput): MrpLabel {
  const size = `${trim(input.length)} x ${trim(input.width)} x ${trim(input.height)} in`;
  return {
    serial: input.serial,
    brand: input.brandName,
    model: input.modelName,
    variant: input.variantName,
    size,
    manufacturedOn: input.manufacturedOn.toISOString().slice(0, 10),
    mrp: input.mrp ?? null,
    warranty:
      input.warrantyMonths != null
        ? `${input.warrantyMonths} months (from invoice date)`
        : null,
    scanPayload: `SN:${input.serial}`,
  };
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}
