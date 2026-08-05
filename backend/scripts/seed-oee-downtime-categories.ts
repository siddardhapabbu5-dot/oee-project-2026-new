import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** OEE guidance categories for downtime entry (Performance + Availability + Quality) */
const CATEGORIES: Array<{ code: string; name: string; description: string }> = [
  // Performance
  { code: 'PERF-SPEED', name: 'Speed Loss', description: 'Performance — speed loss' },
  { code: 'PERF-MINOR', name: 'Minor Stops', description: 'Performance — minor stops' },
  { code: 'PERF-ADJ', name: 'Machine Adjustment', description: 'Performance — machine adjustment' },
  { code: 'PERF-MAT', name: 'Material Issues', description: 'Performance — material issues' },
  { code: 'PERF-MECH', name: 'Mechanical Issues', description: 'Performance — mechanical issues' },
  { code: 'PERF-ELEC', name: 'Electrical Issues', description: 'Performance — electrical issues' },
  { code: 'PERF-UTIL', name: 'Utility Issues', description: 'Performance — utility issues' },
  { code: 'PERF-OPER', name: 'Operator Issues', description: 'Performance — operator issues' },
  { code: 'PERF-PROC', name: 'Process Variation', description: 'Performance — process variation' },
  { code: 'PERF-QI', name: 'Quality Inspection Delays', description: 'Performance — quality inspection delays' },
  // Availability
  { code: 'AVAIL-PPL', name: 'Planned Production Loss', description: 'Availability — planned production loss' },
  { code: 'AVAIL-MECH', name: 'Mechanical Breakdown', description: 'Availability — mechanical breakdown' },
  { code: 'AVAIL-ELEC', name: 'Electrical Breakdown', description: 'Availability — electrical breakdown' },
  { code: 'AVAIL-UTIL', name: 'Utility Failure', description: 'Availability — utility failure' },
  { code: 'AVAIL-MAT', name: 'Material Shortage', description: 'Availability — material shortage' },
  { code: 'AVAIL-QH', name: 'Quality Hold', description: 'Availability — quality hold' },
  { code: 'AVAIL-MANP', name: 'Manpower', description: 'Availability — manpower' },
  { code: 'AVAIL-PROC', name: 'Process Delay', description: 'Availability — process delay' },
  { code: 'AVAIL-SAFE', name: 'Safety', description: 'Availability — safety' },
  { code: 'AVAIL-EXT', name: 'External Causes', description: 'Availability — external causes' },
  // Quality
  { code: 'QUAL-FILL', name: 'Filling Defects', description: 'Quality — filling defects' },
  { code: 'QUAL-CAP', name: 'Cap Defects', description: 'Quality — cap defects' },
  { code: 'QUAL-BOTTLE', name: 'Bottle Defects', description: 'Quality — bottle defects' },
  { code: 'QUAL-LABEL', name: 'Label Defects', description: 'Quality — label defects' },
  { code: 'QUAL-CODE', name: 'Date Coding Defects', description: 'Quality — date coding defects' },
  { code: 'QUAL-PACK', name: 'Packaging Defects', description: 'Quality — packaging defects' },
  { code: 'QUAL-PROD', name: 'Product Quality', description: 'Quality — product quality' },
  { code: 'QUAL-START', name: 'Startup Rejects', description: 'Quality — startup rejects' },
  { code: 'QUAL-REWORK', name: 'Rework', description: 'Quality — rework' },
  { code: 'QUAL-QA', name: 'Inspection & QA Rejections', description: 'Quality — inspection & QA rejections' },
];

async function main() {
  for (const cat of CATEGORIES) {
    await prisma.downtimeCategory.upsert({
      where: { code: cat.code },
      update: {
        name: cat.name,
        description: cat.description,
        isActive: true,
        deletedAt: null,
      },
      create: {
        code: cat.code,
        name: cat.name,
        description: cat.description,
        isActive: true,
      },
    });
  }
  console.log(`Upserted ${CATEGORIES.length} downtime categories for OEE guidance.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
