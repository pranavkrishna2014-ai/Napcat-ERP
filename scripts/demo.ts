/**
 * End-to-end demonstration of the Napcat ERP domain — the full lifecycle of a
 * mattress order, driven by the SAME production code the API uses, with no
 * database required. Run with:  npx ts-node scripts/demo.ts
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import {
  FormulaEngineService,
  computeVariance,
  TemplateDefinition,
} from '../src/formula-engine';
import {
  checkAvailability,
  RequirementLine,
} from '../src/modules/production/availability';
import { buildSerialRun } from '../src/modules/finished-goods/serial';
import { buildMrpLabel } from '../src/modules/finished-goods/mrp-label';
import { computeExpiry, daysUntilExpiry } from '../src/modules/warranty/warranty-dates';
import { validateClaim } from '../src/modules/warranty/claim-validation';
import { reconcileDispatch } from '../src/modules/dispatch/reconciliation';

const line = (s = '') => console.log(s);
const rule = () => line('─'.repeat(66));
const head = (n: number, t: string) => {
  line();
  rule();
  line(`  ${n}.  ${t}`);
  rule();
};

// --- Load a real model from the migrated Excel catalogue ---------------------
const catalog = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../prisma/data/model-catalog.json'), 'utf8'),
);
const model = catalog.models.find((m: any) => m.code === 'SPINAL-ALIGNER');
const template: TemplateDefinition = {
  id: model.code,
  version: 1,
  layers: model.layers.map((l: any, i: number) => ({
    id: `l${i}`,
    sequence: i + 1,
    materialId: l.material,
    materialName: l.material,
    uomCode: l.uom,
    layerKey: l.key,
    thicknessFormula: l.thickness,
    usageFormula: l.usage,
  })),
};

const engine = new FormulaEngineService();
const order = { LENGTH: 75, WIDTH: 60, HEIGHT: 6, BORDER_WIDTH: 82 };
const qty = 3;

line();
line('   NAPCAT MANUFACTURING ERP — end-to-end operation demo');
line(`   Order: ${qty} × Spinal Aligner  ${order.LENGTH}" × ${order.WIDTH}" × ${order.HEIGHT}"`);

// 1. Formula Engine → material requirement -----------------------------------
head(1, 'Formula Engine → material requirement (computed, not stored)');
const req = engine.computeRequirement(template, order, qty);
line('   Material                  Formula result / unit      Order total');
for (const t of req.materialTotals) {
  line(
    `   ${t.materialName!.padEnd(22)} ${String(t.baseQtyPerUnit).padStart(10)} ${(t.uomCode ?? '').padEnd(4)}   ${String(t.standardQty).padStart(8)} ${t.uomCode}`,
  );
}

// 2. Availability check against the inventory ledger -------------------------
head(2, 'Availability check against stock');
const reqLines: RequirementLine[] = req.materialTotals.map((t) => ({
  materialId: t.materialId,
  materialName: t.materialName,
  requiredQty: t.standardQty,
}));
const stock = new Map<string, number>();
for (const r of reqLines) stock.set(r.materialId, r.requiredQty + 50);
stock.set('Rebonded Foam', 25); // deliberately short (need 31.25)
const avail = checkAvailability(reqLines, stock);
for (const l of avail.lines) {
  const mark = l.sufficient ? 'ok  ' : 'SHORT';
  line(
    `   [${mark}] ${l.materialName!.padEnd(20)} need ${String(l.requiredQty).padStart(8)}  have ${String(l.available).padStart(8)}  short ${l.shortfall}`,
  );
}
line(`   → overall: ${avail.ok ? 'all available' : 'shortfall — replenish before issue'}`);

// 3. Production variance (standard vs actual) --------------------------------
head(3, 'Production variance (standard vs actual, ±1% tolerance)');
const actuals: Record<string, number> = { 'Rebonded Foam': 31.9, 'Border Fabric': 1.79 };
for (const t of req.materialTotals) {
  const actual = actuals[t.materialId] ?? t.standardQty;
  const v = computeVariance(t.standardQty, actual, 0.01);
  const flag = v.status === 'EXCEPTION' ? '  ⚑ EXCEPTION' : '';
  line(
    `   ${t.materialName!.padEnd(22)} std ${String(t.standardQty).padStart(8)}  act ${String(actual).padStart(8)}  ${v.variancePct >= 0 ? '+' : ''}${v.variancePct}%${flag}`,
  );
}

// 4. Completion → serial numbers ---------------------------------------------
head(4, 'QC pass → completion → unique serials');
const made = new Date(Date.UTC(2026, 6, 3));
const serials = buildSerialRun('NAP', 'SPINAL-ALIGNER', made, 1, qty);
serials.forEach((s, i) => line(`   unit ${i + 1}:  ${s}`));

// 5. MRP label ----------------------------------------------------------------
head(5, 'MRP label (printed & scanned on the floor)');
const label = buildMrpLabel({
  serial: serials[0],
  brandName: 'Napcat',
  modelName: 'Spinal Aligner',
  variantName: 'Standard',
  length: order.LENGTH,
  width: order.WIDTH,
  height: order.HEIGHT,
  manufacturedOn: made,
  mrp: 21999,
  warrantyMonths: 120,
});
line(`   ${label.brand} ${label.model} — ${label.size}`);
line(`   Serial : ${label.serial}`);
line(`   MRP    : ₹${label.mrp}     Warranty: ${label.warranty}`);
line(`   Scan   : ${label.scanPayload}`);

// 6. Dispatch + Tally invoice → warranty activation --------------------------
head(6, 'Dispatch → Tally invoice sync → warranty activation');
const dispatched = serials;                 // all 3 dispatched
const invoiced = [serials[0], serials[1]];  // Tally invoiced 2 of them
const invoiceDate = new Date(Date.UTC(2026, 7, 10));
const expiry = computeExpiry(invoiceDate, 120);
line(`   Invoice date : ${invoiceDate.toISOString().slice(0, 10)}  (warranty START — never the mfg date)`);
line(`   Expiry       : ${expiry.toISOString().slice(0, 10)}  (${Math.round(daysUntilExpiry(expiry, invoiceDate) / 365)} yr policy)`);
line(`   Activated    : ${invoiced.length} of ${dispatched.length} dispatched serials`);

// 7. Warranty claim validation ------------------------------------------------
head(7, 'Warranty claim validation');
const good = validateClaim({
  serialFound: true, warrantyStatus: 'ACTIVE', expiryDate: expiry,
  now: new Date(Date.UTC(2027, 0, 15)),
});
line(`   Claim on ${serials[0]}:  ${good.ok ? 'ACCEPTED' : 'REJECTED — ' + good.reasons.join('; ')}`);
const bad = validateClaim({
  serialFound: true, warrantyStatus: 'ACTIVE',
  expiryDate: new Date(Date.UTC(2025, 0, 1)),
  now: new Date(Date.UTC(2027, 0, 15)),
});
line(`   Claim on expired unit:  ${bad.ok ? 'ACCEPTED' : 'REJECTED — ' + bad.reasons.join('; ')}`);

// 8. Dispatch reconciliation --------------------------------------------------
head(8, 'Dispatch ↔ invoice reconciliation');
const recon = reconcileDispatch(dispatched, invoiced);
line(`   Matched              : ${recon.matched.length}`);
line(`   Dispatched, un-invoiced: ${recon.dispatchedNotInvoiced.join(', ') || 'none'}`);
line(`   Status               : ${recon.ok ? 'reconciled' : 'MISMATCH — investigate'}`);

line();
rule();
line('   Order → production → finished goods → dispatch → warranty: complete.');
rule();
line();
