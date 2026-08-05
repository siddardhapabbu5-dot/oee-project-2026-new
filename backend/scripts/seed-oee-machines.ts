import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Bottled-water line equipment for downtime Machine dropdown */
const MACHINE_NAMES = [
  'Raw Water Pump',
  'Sand Filter',
  'Activated Carbon Filter',
  'Softener',
  'RO Plant',
  'UV Sterilizer',
  'Ozone Generator',
  'Product Water Tank',
  'Blow Mould',
  'Bottle Unscrambler',
  'Air Conveyor',
  'Bottle Rinser',
  'Filler',
  'Cap Elevator',
  'Cap Feeder',
  'Capper',
  'Vision Inspection System',
  'Bottle Inspection Conveyor',
  'Inkjet Printer',
  'Labeling Machine',
  'Shrink Wrapper',
  'Shrink Tunnel',
  'Carton Erector',
  'Case Packer',
  'Carton Sealer',
  'Palletizer',
  'Infeed Conveyor',
  'Transfer Conveyor',
  'Outfeed Conveyor',
  'Air Compressor',
  'Air Dryer',
  'Chiller',
  'Boiler',
  'DG Generator',
  'Electrical Panel',
  'PLC/HMI',
  'Other',
] as const;

function slugify(name: string) {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

async function main() {
  const lines = await prisma.productionLine.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: 'asc' },
  });

  if (!lines.length) {
    throw new Error('No active production lines found. Create a line first.');
  }

  // Hide older / non-catalog machines from the dropdown
  await prisma.machine.updateMany({
    data: { isActive: false },
  });

  let upserted = 0;
  for (const line of lines) {
    const lineSlug = slugify(line.code || line.name || 'LINE').slice(0, 20);
    for (const name of MACHINE_NAMES) {
      const code = `${lineSlug}-${slugify(name)}`.slice(0, 80);
      await prisma.machine.upsert({
        where: { code },
        update: {
          name,
          lineId: line.id,
          isActive: true,
          deletedAt: null,
          description: 'Bottled water equipment catalog',
        },
        create: {
          code,
          name,
          lineId: line.id,
          isActive: true,
          description: 'Bottled water equipment catalog',
        },
      });
      upserted += 1;
    }
    console.log(`Line ${line.code || line.name}: ${MACHINE_NAMES.length} machines`);
  }

  console.log(`Upserted ${upserted} machine records across ${lines.length} line(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
