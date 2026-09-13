/**
 * Add "Transformer cutout fuse" as a downtime Category (shows in Category dropdown).
 * Run: npx tsx scripts/seed-transformer-cutout-category.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const cat = await prisma.downtimeCategory.upsert({
    where: { code: 'AVAIL-XFMR' },
    update: {
      name: 'Transformer cutout fuse',
      description: 'Availability — transformer cutout fuse / HT fuse trip',
      isActive: true,
      deletedAt: null,
    },
    create: {
      code: 'AVAIL-XFMR',
      name: 'Transformer cutout fuse',
      description: 'Availability — transformer cutout fuse / HT fuse trip',
      isActive: true,
    },
  });

  const reasons = [
    { code: 'AVAIL-XFMR-CUTOUT', name: 'Transformer cutout fuse' },
    { code: 'AVAIL-XFMR-HT', name: 'HT fuse blown' },
    { code: 'AVAIL-XFMR-TRIP', name: 'Cutout fuse trip' },
    { code: 'AVAIL-XFMR-POWER', name: 'Power Cut' },
  ];

  for (const r of reasons) {
    await prisma.downtimeReason.upsert({
      where: { code: r.code },
      update: {
        name: r.name,
        categoryId: cat.id,
        isActive: true,
        deletedAt: null,
      },
      create: {
        code: r.code,
        name: r.name,
        categoryId: cat.id,
        isActive: true,
      },
    });
  }

  console.log(`Category ready: ${cat.code} — ${cat.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
