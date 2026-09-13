/**
 * Add Transformer cutout fuse (and related utility reasons) under Utility / Electrical categories.
 * Run: npx tsx scripts/seed-transformer-cutout-fuse.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TARGET_CATEGORY_CODES = ['AVAIL-UTIL', 'PERF-UTIL', 'AVAIL-ELEC', 'PERF-ELEC'] as const;

const REASONS: Array<{ code: string; name: string }> = [
  { code: 'UTIL-XFMR-CUTOUT', name: 'Transformer cutout fuse' },
  { code: 'UTIL-POWER-CUT', name: 'Power Cut' },
  { code: 'UTIL-POWER-FAIL', name: 'Power failure' },
  { code: 'UTIL-LOW-VOLT', name: 'Low voltage' },
];

async function main() {
  const categories = await prisma.downtimeCategory.findMany({
    where: { code: { in: [...TARGET_CATEGORY_CODES] }, deletedAt: null },
  });

  if (categories.length === 0) {
    throw new Error('Utility/Electrical categories not found. Run seed-oee-downtime-categories first.');
  }

  let upserted = 0;
  for (const category of categories) {
    for (const reason of REASONS) {
      const code = `${category.code}-${reason.code}`;
      await prisma.downtimeReason.upsert({
        where: { code },
        update: {
          name: reason.name,
          categoryId: category.id,
          isActive: true,
          deletedAt: null,
        },
        create: {
          code,
          name: reason.name,
          categoryId: category.id,
          isActive: true,
        },
      });
      upserted += 1;
      console.log(`OK: ${category.name} → ${reason.name}`);
    }
  }

  console.log(`Upserted ${upserted} downtime reason(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
