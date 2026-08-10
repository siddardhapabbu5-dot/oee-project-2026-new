/**
 * Upsert FD School / DP School products & SKUs from the user's sheet.
 * Run: npx tsx scripts/seed-school-skus.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PRODUCTS = [
  { code: 'PROD-FD-SCHOOL', name: 'FD School' },
  { code: 'PROD-DP-SCHOOL', name: 'DP School' },
] as const;

const SKUS = [
  { code: 'SKU-FD School-250-ML', productCode: 'PROD-FD-SCHOOL', name: 'FD School 250 ML', packVolume: '250 ML', packSize: 30 },
  { code: 'SKU-DP School-250-ML', productCode: 'PROD-DP-SCHOOL', name: 'DP School 250 ML', packVolume: '250 ML', packSize: 30 },
  { code: 'SKU-FD School-500-ML', productCode: 'PROD-FD-SCHOOL', name: 'FD School 500 ML', packVolume: '500 ML', packSize: 24 },
  { code: 'SKU-DP School-500-ML', productCode: 'PROD-DP-SCHOOL', name: 'DP School 500 ML', packVolume: '500 ML', packSize: 24 },
] as const;

async function main() {
  const productIds = new Map<string, string>();

  for (const p of PRODUCTS) {
    const byCode = await prisma.product.findFirst({
      where: { OR: [{ code: p.code }, { name: { equals: p.name, mode: 'insensitive' } }] },
    });
    if (byCode) {
      const row = await prisma.product.update({
        where: { id: byCode.id },
        data: { code: p.code, name: p.name, isActive: true, deletedAt: null, uom: 'CASE' },
      });
      productIds.set(p.code, row.id);
      console.log('product', row.code, row.name);
    } else {
      const row = await prisma.product.create({
        data: { code: p.code, name: p.name, isActive: true, uom: 'CASE' },
      });
      productIds.set(p.code, row.id);
      console.log('product+', row.code, row.name);
    }
  }

  for (const s of SKUS) {
    const productId = productIds.get(s.productCode)!;
    const existing = await prisma.sku.findFirst({ where: { code: s.code } });
    if (existing) {
      const row = await prisma.sku.update({
        where: { id: existing.id },
        data: {
          name: s.name,
          productId,
          packVolume: s.packVolume,
          packSize: s.packSize,
          isActive: true,
          deletedAt: null,
        },
      });
      console.log('sku', row.code, row.packVolume, row.packSize);
    } else {
      const row = await prisma.sku.create({
        data: {
          code: s.code,
          name: s.name,
          productId,
          packVolume: s.packVolume,
          packSize: s.packSize,
          isActive: true,
        },
      });
      console.log('sku+', row.code, row.packVolume, row.packSize);
    }
  }

  console.log('School products & SKUs ready.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
