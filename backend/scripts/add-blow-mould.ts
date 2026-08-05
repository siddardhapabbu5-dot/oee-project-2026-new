import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
  });

  for (const line of lines) {
    const lineSlug = slugify(line.code || line.name || 'LINE').slice(0, 20);
    const code = `${lineSlug}-BLOW-MOULD`.slice(0, 80);
    await prisma.machine.upsert({
      where: { code },
      update: {
        name: 'Blow Mould',
        lineId: line.id,
        isActive: true,
        deletedAt: null,
        description: 'Bottled water equipment catalog',
      },
      create: {
        code,
        name: 'Blow Mould',
        lineId: line.id,
        isActive: true,
        description: 'Bottled water equipment catalog',
      },
    });
    console.log(`Added Blow Mould for ${line.code || line.name}`);
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
