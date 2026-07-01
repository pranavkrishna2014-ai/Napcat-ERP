/**
 * Seed script — demonstrates the end-to-end setup for ONE mattress model using
 * the Formula Engine, mirroring the three-layer example in the master spec.
 *
 * Run with: npm run db:seed  (requires a generated Prisma client + database).
 *
 * This is intentionally small; it exists to prove the data model and formula
 * flow, not to load the full catalogue. Real model formulas will be imported
 * from the factory's Excel workbooks once available.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // --- Units of measure -----------------------------------------------------
  const cf = await prisma.unitOfMeasure.upsert({
    where: { code: 'CF' },
    update: {},
    create: { code: 'CF', name: 'Cubic Feet' },
  });

  // --- Material categories & materials --------------------------------------
  const foamCat = await prisma.materialCategory.upsert({
    where: { name: 'Foam' },
    update: {},
    create: { name: 'Foam' },
  });
  const latexCat = await prisma.materialCategory.upsert({
    where: { name: 'Latex' },
    update: {},
    create: { name: 'Latex' },
  });

  const superSoft = await prisma.material.upsert({
    where: { code: 'FOAM-32D-SS' },
    update: {},
    create: {
      code: 'FOAM-32D-SS',
      name: '32D Super Soft Foam',
      categoryId: foamCat.id,
      uomId: cf.id,
      density: 32,
      isContingentEligible: true,
    },
  });
  const latex = await prisma.material.upsert({
    where: { code: 'LATEX-STD' },
    update: {},
    create: {
      code: 'LATEX-STD',
      name: 'Latex',
      categoryId: latexCat.id,
      uomId: cf.id,
      isContingentEligible: true,
    },
  });
  const hrFoam = await prisma.material.upsert({
    where: { code: 'FOAM-HR' },
    update: {},
    create: {
      code: 'FOAM-HR',
      name: 'HR Foam',
      categoryId: foamCat.id,
      uomId: cf.id,
    },
  });

  // --- Warranty policy ------------------------------------------------------
  const policy = await prisma.warrantyPolicy.upsert({
    where: { name: 'Standard 10 Year' },
    update: {},
    create: { name: 'Standard 10 Year', durationMonths: 120, fullCoverMonths: 12 },
  });

  // --- Brand / model / variant ----------------------------------------------
  const brand = await prisma.brand.upsert({
    where: { code: 'NAP' },
    update: {},
    create: { code: 'NAP', name: 'Napcat' },
  });
  const model = await prisma.mattressModel.upsert({
    where: { code: 'ORTHO-LUX' },
    update: {},
    create: {
      code: 'ORTHO-LUX',
      name: 'Ortho Lux',
      brandId: brand.id,
      warrantyPolicyId: policy.id,
    },
  });
  const variant = await prisma.modelVariant.upsert({
    where: { code: 'ORTHO-LUX-Q' },
    update: {},
    create: {
      code: 'ORTHO-LUX-Q',
      name: 'Ortho Lux Queen 72x60x8',
      modelId: model.id,
      defaultLength: 72,
      defaultWidth: 60,
      defaultHeight: 8,
    },
  });

  // --- Production template with formula-driven layers ------------------------
  const template = await prisma.productionTemplate.create({
    data: {
      variantId: variant.id,
      version: 1,
      status: 'ACTIVE',
      overallHeight: 8,
      activatedAt: new Date(),
      variables: {
        create: [
          { key: 'LENGTH', label: 'Length (in)', defaultValue: 72 },
          { key: 'WIDTH', label: 'Width (in)', defaultValue: 60 },
          { key: 'OVERALL_HEIGHT', label: 'Overall Height (in)', defaultValue: 8 },
        ],
      },
      layers: {
        create: [
          {
            sequence: 1,
            materialId: superSoft.id,
            uomId: cf.id,
            formula: 'LENGTH * WIDTH * THICKNESS / 1728',
            fixedThickness: 2,
            wastageRate: 0,
            toleranceRate: 0.01,
            isContingentEligible: true,
          },
          {
            sequence: 2,
            materialId: latex.id,
            uomId: cf.id,
            formula: 'LENGTH * WIDTH * THICKNESS / 1728',
            fixedThickness: 1,
            wastageRate: 0,
            toleranceRate: 0.01,
            isContingentEligible: true,
          },
          {
            sequence: 3,
            materialId: hrFoam.id,
            uomId: cf.id,
            formula:
              'LENGTH * WIDTH * (OVERALL_HEIGHT - LAYER1_THICKNESS - LAYER2_THICKNESS) / 1728',
            wastageRate: 0.05,
            toleranceRate: 0.01,
          },
        ],
      },
    },
  });

  console.log(`Seeded template ${template.id} for variant ${variant.code}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
