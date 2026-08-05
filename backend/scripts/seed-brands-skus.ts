/**
 * Seed brands + SKUs from the Nakshatra product catalog list.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function slug(s: string) {
  return s
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Full product name -> brand + pack size */
const CATALOG: Array<{ fullName: string; brand: string; size: string }> = [
  { fullName: 'Lavin Orange-250 ML', brand: 'Lavin Orange', size: '250 ML' },
  { fullName: 'Lavin Orange-500 ML', brand: 'Lavin Orange', size: '500 ML' },
  { fullName: 'Lavin Orange-1000 ML', brand: 'Lavin Orange', size: '1000 ML' },
  { fullName: 'Lavin Orange-2000 ML', brand: 'Lavin Orange', size: '2000 ML' },
  { fullName: 'Lavin Orange-Jar-20 L', brand: 'Lavin Orange', size: 'Jar-20 L' },
  { fullName: 'B2 Blue-500 ML', brand: 'B2 Blue', size: '500 ML' },
  { fullName: 'B2 White-500 ML', brand: 'B2 White', size: '500 ML' },
  { fullName: 'Smart Pink-500 ML', brand: 'Smart Pink', size: '500 ML' },
  { fullName: 'Smart White-500 ML', brand: 'Smart White', size: '500 ML' },
  { fullName: 'Lavin White-500 ML', brand: 'Lavin White', size: '500 ML' },
  { fullName: 'Natural-500 ML', brand: 'Natural', size: '500 ML' },
  { fullName: 'Ice Burg Green-500 ML', brand: 'Ice Burg Green', size: '500 ML' },
  { fullName: 'Ice Burg Black-500 ML', brand: 'Ice Burg Black', size: '500 ML' },
  { fullName: 'Bisleri Green-500 ML', brand: 'Bisleri Green', size: '500 ML' },
  { fullName: 'Mansion House-500 ML', brand: 'Mansion House', size: '500 ML' },
  { fullName: 'Gloden Drop-1000 ML', brand: 'Gloden Drop', size: '1000 ML' },
];

async function main() {
  console.log('Adding brands and SKUs...');

  const brandIds = new Map<string, string>();
  const productIds = new Map<string, string>();

  for (const brandName of [...new Set(CATALOG.map((c) => c.brand))]) {
    const code = `BRD-${slug(brandName)}`;
    const brand = await prisma.brand.upsert({
      where: { code },
      update: { name: brandName, deletedAt: null, isActive: true },
      create: {
        code,
        name: brandName,
        description: `${brandName} brand`,
      },
    });
    brandIds.set(brandName, brand.id);

    const productCode = `PRD-${slug(brandName)}`;
    const product = await prisma.product.upsert({
      where: { code: productCode },
      update: {
        name: brandName,
        brandId: brand.id,
        deletedAt: null,
        isActive: true,
      },
      create: {
        code: productCode,
        name: brandName,
        brandId: brand.id,
        description: `${brandName} product family`,
        uom: 'CASE',
      },
    });
    productIds.set(brandName, product.id);
    console.log(`  Brand/Product: ${brandName}`);
  }

  let skuCount = 0;
  for (const item of CATALOG) {
    const productId = productIds.get(item.brand)!;
    const skuCode = `SKU-${slug(item.brand)}-${slug(item.size)}`;
    await prisma.sku.upsert({
      where: { code: skuCode },
      update: {
        name: item.fullName,
        productId,
        deletedAt: null,
        isActive: true,
      },
      create: {
        code: skuCode,
        name: item.fullName,
        productId,
      },
    });
    skuCount += 1;
    console.log(`  SKU: ${item.fullName}`);
  }

  console.log(`\nDone. ${brandIds.size} brands, ${skuCount} SKUs.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
