/**
 * Serial number construction — pure and unit-tested.
 *
 * Every finished mattress gets a globally unique serial printed on its MRP
 * label and traceable through batch → dispatch → invoice → warranty → claim.
 * Format: BRAND-MODEL-YYMMDD-NNNN  (e.g. NAP-ORTHOLUX-260703-0001).
 */

export interface SerialParts {
  brandCode: string;
  modelCode: string;
  date: Date;
  sequence: number;
}

function token(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 12);
}

function yymmdd(date: Date): string {
  const yy = String(date.getUTCFullYear()).slice(-2);
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

export function buildSerial(parts: SerialParts): string {
  if (!(parts.sequence >= 1) || !Number.isInteger(parts.sequence)) {
    throw new Error(`Serial sequence must be a positive integer`);
  }
  const seq = String(parts.sequence).padStart(4, '0');
  return `${token(parts.brandCode)}-${token(parts.modelCode)}-${yymmdd(parts.date)}-${seq}`;
}

/** Build a contiguous run of serials for a production batch. */
export function buildSerialRun(
  brandCode: string,
  modelCode: string,
  date: Date,
  startSequence: number,
  count: number,
): string[] {
  if (!(count >= 1)) throw new Error('Count must be at least 1');
  return Array.from({ length: count }, (_, i) =>
    buildSerial({ brandCode, modelCode, date, sequence: startSequence + i }),
  );
}
