import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const reasons = await prisma.downtimeReason.updateMany({
    data: { deletedAt: now, isActive: false },
  });
  const categories = await prisma.downtimeCategory.updateMany({
    data: { deletedAt: now, isActive: false },
  });
  console.log(`reasons cleared: ${reasons.count}`);
  console.log(`categories cleared: ${categories.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
