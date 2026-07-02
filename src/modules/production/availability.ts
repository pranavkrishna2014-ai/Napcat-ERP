import { round6 } from '../inventory/inventory-math';

/**
 * Pure material-availability check. Given the standard requirements for a
 * production order and the currently available (unreserved) stock per material,
 * determine what can proceed and what is short.
 */

export interface RequirementLine {
  materialId: string;
  materialName?: string;
  uomCode?: string;
  requiredQty: number;
}

export interface AvailabilityLine extends RequirementLine {
  available: number;
  shortfall: number;
  sufficient: boolean;
}

export interface AvailabilityResult {
  ok: boolean;
  lines: AvailabilityLine[];
}

/**
 * @param requirements per-material required quantities
 * @param available    map materialId -> available quantity (already net of
 *                     existing reservations)
 */
export function checkAvailability(
  requirements: RequirementLine[],
  available: Map<string, number>,
): AvailabilityResult {
  const lines: AvailabilityLine[] = requirements.map((r) => {
    const have = available.get(r.materialId) ?? 0;
    const shortfall = round6(Math.max(0, r.requiredQty - have));
    return {
      ...r,
      available: round6(have),
      shortfall,
      sufficient: shortfall === 0,
    };
  });
  return { ok: lines.every((l) => l.sufficient), lines };
}
