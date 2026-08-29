import { PrismaClient } from '@prisma/client';
import { canonicalDowntimeReasonName } from '../src/utils/downtimeReasonName.ts';

const prisma = new PrismaClient();

const rows = await prisma.downtimeReason.findMany({
  where: { deletedAt: null },
  include: { _count: { select: { downtimeEntries: true } } },
});

const groups = new Map<string, typeof rows>();
for (const r of rows) {
  const key = canonicalDowntimeReasonName(r.name);
  const g = groups.get(key) ?? [];
  g.push(r);
  groups.set(key, g);
}

let merged = 0;
for (const [canon, group] of groups) {
  if (group.length < 2 && group[0]?.name === canon) continue;
  const ranked = [...group].sort((a, b) => {
    if (a.name.toLowerCase() === canon.toLowerCase()) return -1;
    if (b.name.toLowerCase() === canon.toLowerCase()) return 1;
    return b._count.downtimeEntries - a._count.downtimeEntries;
  });
  const keeper = ranked[0];
  if (keeper.name !== canon) {
    await prisma.downtimeReason.update({ where: { id: keeper.id }, data: { name: canon } });
  }
  for (const extra of ranked.slice(1)) {
    await prisma.downtimeEntry.updateMany({
      where: { reasonId: extra.id },
      data: { reasonId: keeper.id },
    });
    await prisma.downtimeReason.update({
      where: { id: extra.id },
      data: { deletedAt: new Date(), isActive: false },
    });
    merged += 1;
    console.log(`Merged "${extra.name}" -> "${canon}"`);
  }
}

console.log(JSON.stringify({ merged, reasons: rows.length - merged }, null, 2));
await prisma.$disconnect();
