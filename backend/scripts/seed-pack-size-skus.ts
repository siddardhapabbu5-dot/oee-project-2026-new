/**
 * Seed standard SKU pack-volume list.
 * 200 / 250 / 300 / 500 / 750 / 1000 / 2000 ML + Jar-20L
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** units per case by pack volume + bottles/hour rated speed */
const PACK_SIZES: Array<{ volume: string; code: string; name: string; unitsPerCase: number; bottlesPerHour: number }> = [
  { volume: '200 ML', code: 'SKU-200-ML', name: '200 ML', unitsPerCase: 36, bottlesPerHour: 5400 },
  { volume: '250 ML', code: 'SKU-250-ML', name: '250 ML', unitsPerCase: 30, bottlesPerHour: 5400 },
  { volume: '300 ML', code: 'SKU-300-ML', name: '300 ML', unitsPerCase: 24, bottlesPerHour: 5400 },
  { volume: '500 ML', code: 'SKU-500-ML', name: '500 ML', unitsPerCase: 24, bottlesPerHour: 5400 },
  { volume: '750 ML', code: 'SKU-750-ML', name: '750 ML', unitsPerCase: 12, bottlesPerHour: 5400 },
  { volume: '1000 ML', code: 'SKU-1000-ML', name: '1000 ML', unitsPerCase: 12, bottlesPerHour: 5400 },
  { volume: '2000 ML', code: 'SKU-2000-ML', name: '2000 ML', unitsPerCase: 6, bottlesPerHour: 5400 },
  { volume: 'Jar-20L', code: 'SKU-JAR-20L', name: 'Jar-20L', unitsPerCase: 1, bottlesPerHour: 5400 },
];

async function main() {
  const product = await prisma.product.upsert({
    where: { code: 'PRD-PACK-SIZES' },
    update: {
      name: 'Pack Sizes',
      description: 'Standard SKU pack volume catalog',
      deletedAt: null,
      isActive: true,
    },
    create: {
      code: 'PRD-PACK-SIZES',
      name: 'Pack Sizes',
      description: 'Standard SKU pack volume catalog',
      uom: 'CASE',
    },
  });

  for (const item of PACK_SIZES) {
    await prisma.sku.upsert({
      where: { code: item.code },
      update: {
        name: item.name,
        productId: product.id,
        packVolume: item.volume,
        packSize: item.unitsPerCase,
        bottlesPerHour: item.bottlesPerHour,
        deletedAt: null,
        isActive: true,
      },
      create: {
        code: item.code,
        name: item.name,
        productId: product.id,
        packVolume: item.volume,
        packSize: item.unitsPerCase,
        bottlesPerHour: item.bottlesPerHour,
      },
    });
    const cph = Math.round(item.bottlesPerHour / item.unitsPerCase);
    console.log(`  SKU: ${item.name} (${item.unitsPerCase}/case → ${cph} cases/hr)`);
  }

  console.log(`\nDone. ${PACK_SIZES.length} pack-size SKUs under ${product.name}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
