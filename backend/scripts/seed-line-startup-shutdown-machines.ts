/**
 * Add Line Startup / Line Shut Down to Machine dropdown for all lines.
 * Run: npx tsx scripts/seed-line-startup-shutdown-machines.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const NAMES = ['Line Startup', 'Line Shut Down'] as const;

function slugify(name: string) {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main() {
  const lines = await prisma.productionLine.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true, name: true },
  });

  if (lines.length === 0) {
    throw new Error('No production lines found');
  }

  let upserted = 0;
  for (const line of lines) {
    for (const name of NAMES) {
      const code = `${line.code || 'LINE'}-${slugify(name)}`;
      await prisma.machine.upsert({
        where: { code },
        update: {
          name,
          lineId: line.id,
          isActive: true,
          deletedAt: null,
        },
        create: {
          code,
          name,
          lineId: line.id,
          isActive: true,
        },
      });
      upserted += 1;
      console.log(`OK: ${line.code || line.name} → ${name}`);
    }
  }

  console.log(`Upserted ${upserted} machine record(s) across ${lines.length} line(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
