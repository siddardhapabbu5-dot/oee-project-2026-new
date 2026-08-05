/**
 * Add availability-loss style machines for downtime entry dropdown.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const LOSS_MACHINES = [
  { code: 'LINE-STARTUP-LOSS', name: 'Line startup loss' },
  { code: 'LINE-END-LOSS', name: 'Line end loss' },
  { code: 'MANPOWER-DELAY', name: 'Manpower delay' },
];

async function main() {
  const line =
    (await prisma.productionLine.findFirst({ where: { code: 'LINE-01', deletedAt: null } })) ||
    (await prisma.productionLine.findFirst({ where: { deletedAt: null } }));

  if (!line) throw new Error('No production line found');

  for (const m of LOSS_MACHINES) {
    await prisma.machine.upsert({
      where: { code: m.code },
      update: {
        name: m.name,
        lineId: line.id,
        deletedAt: null,
        isActive: true,
        description: 'Availability loss / downtime entry option',
      },
      create: {
        code: m.code,
        name: m.name,
        lineId: line.id,
        description: 'Availability loss / downtime entry option',
      },
    });
    console.log('Machine:', m.name);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
