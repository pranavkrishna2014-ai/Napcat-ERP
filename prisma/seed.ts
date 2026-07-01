/**
 * Seed script — loads the full model catalog extracted from the factory Excel
 * workbooks (prisma/data/model-catalog.json) into the database:
 *   units of measure, material categories & materials, the Napcat brand,
 *   every mattress model + a default variant, and an ACTIVE, formula-driven
 *   ProductionTemplate (version 1) with its layers.
 *
 * Run with: npm run db:seed  (requires a generated Prisma client + database).
 *
 * Re-runnable: brands/models/materials are upserted by their unique codes/names.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/password.util';

const prisma = new PrismaClient();

/** Create the standard roles and an initial admin user (idempotent). */
async function seedAuth(): Promise<void> {
  const roleNames = ['ADMIN', 'PLANNER', 'STORE', 'OPERATOR', 'QC'];
  const roleIds = new Map<string, string>();
  for (const name of roleNames) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    roleIds.set(name, role.id);
  }

  const existing = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (!existing) {
    const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin12345';
    const user = await prisma.user.create({
      data: {
        username: 'admin',
        fullName: 'System Administrator',
        passwordHash: await hashPassword(password),
        roles: { create: [{ roleId: roleIds.get('ADMIN')! }] },
      },
    });
    console.log(
      `Created admin user '${user.username}'.` +
        (process.env.SEED_ADMIN_PASSWORD
          ? ''
          : " Default password 'admin12345' — change it immediately."),
    );
  }
}

interface CatalogLayer {
  key: string;
  material: string;
  uom: string;
  thickness: string | null;
  usage: string;
  expectedPerUnit: number;
  contingentEligible?: boolean;
}
interface CatalogModel {
  brand: string;
  code: string;
  name: string;
  sampleInputs: Record<string, number>;
  layers: CatalogLayer[];
}
interface Catalog {
  units: Record<string, string>;
  models: CatalogModel[];
}

/** Infer a material category from its name. */
function categoryFor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('fabric')) return 'Fabric';
  if (n.includes('spring')) return 'Spring';
  if (n.includes('coir')) return 'Coir';
  if (n.includes('latex')) return 'Latex';
  if (n.includes('memory')) return 'Foam';
  if (n.includes('foam') || n.includes('pu')) return 'Foam';
  return 'Other';
}

async function main(): Promise<void> {
  await seedAuth();

  const catalog = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, 'data', 'model-catalog.json'),
      'utf8',
    ),
  ) as Catalog;

  // --- Units of measure -----------------------------------------------------
  const uomByCode = new Map<string, string>();
  for (const [code, name] of Object.entries(catalog.units)) {
    const uom = await prisma.unitOfMeasure.upsert({
      where: { code },
      update: {},
      create: { code, name },
    });
    uomByCode.set(code, uom.id);
  }

  // --- Categories & materials (deduped by name across all models) -----------
  const categoryByName = new Map<string, string>();
  const materialByName = new Map<string, string>();

  async function ensureCategory(name: string): Promise<string> {
    if (categoryByName.has(name)) return categoryByName.get(name)!;
    const cat = await prisma.materialCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    categoryByName.set(name, cat.id);
    return cat.id;
  }

  async function ensureMaterial(name: string, uomCode: string): Promise<string> {
    if (materialByName.has(name)) return materialByName.get(name)!;
    const categoryId = await ensureCategory(categoryFor(name));
    const code = name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const mat = await prisma.material.upsert({
      where: { code },
      update: {},
      create: {
        code,
        name,
        categoryId,
        uomId: uomByCode.get(uomCode)!,
        isContingentEligible: false,
      },
    });
    materialByName.set(name, mat.id);
    return mat.id;
  }

  // --- Brand ----------------------------------------------------------------
  const brand = await prisma.brand.upsert({
    where: { code: 'NAP' },
    update: {},
    create: { code: 'NAP', name: 'Napcat' },
  });

  // --- Models, variants and formula-driven templates ------------------------
  let created = 0;
  for (const m of catalog.models) {
    const model = await prisma.mattressModel.upsert({
      where: { code: m.code },
      update: {},
      create: { code: m.code, name: m.name, brandId: brand.id },
    });

    const variantCode = `${m.code}-STD`;
    const variant = await prisma.modelVariant.upsert({
      where: { code: variantCode },
      update: {},
      create: {
        code: variantCode,
        name: `${m.name} (standard)`,
        modelId: model.id,
        defaultLength: m.sampleInputs.LENGTH,
        defaultWidth: m.sampleInputs.WIDTH,
        defaultHeight: m.sampleInputs.HEIGHT,
      },
    });

    // Skip if this variant already has a template (keeps the seed idempotent).
    const existing = await prisma.productionTemplate.findFirst({
      where: { variantId: variant.id, version: 1 },
    });
    if (existing) continue;

    // Resolve material ids for all layers first.
    const layerData = [];
    for (let i = 0; i < m.layers.length; i++) {
      const l = m.layers[i];
      const materialId = await ensureMaterial(l.material, l.uom);
      layerData.push({
        sequence: i + 1,
        materialId,
        uomId: uomByCode.get(l.uom)!,
        layerKey: l.key,
        thicknessFormula: l.thickness,
        usageFormula: l.usage,
        isContingentEligible: l.contingentEligible ?? false,
      });
    }

    await prisma.productionTemplate.create({
      data: {
        variantId: variant.id,
        version: 1,
        status: 'ACTIVE',
        overallHeight: m.sampleInputs.HEIGHT,
        activatedAt: new Date(),
        variables: {
          create: [
            { key: 'LENGTH', label: 'Length (in)', defaultValue: m.sampleInputs.LENGTH },
            { key: 'WIDTH', label: 'Breadth (in)', defaultValue: m.sampleInputs.WIDTH },
            { key: 'HEIGHT', label: 'Height (in)', defaultValue: m.sampleInputs.HEIGHT },
            { key: 'BORDER_WIDTH', label: 'Border fabric width (in)', defaultValue: m.sampleInputs.BORDER_WIDTH },
          ],
        },
        layers: { create: layerData },
      },
    });
    created++;
  }

  console.log(
    `Seed complete: brand ${brand.name}, ${catalog.models.length} models ` +
      `(${created} templates created), ${materialByName.size} materials.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
