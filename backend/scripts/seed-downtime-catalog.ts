/**
 * Seed / refresh downtime categories & reasons for Production Entries.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CATALOG: Array<{ code: string; name: string; reasons: Array<{ code: string; name: string }> }> = [
  {
    code: 'MECH',
    name: 'Mechanical',
    reasons: [
      { code: 'MECH-BEARING', name: 'Bearing failure' },
      { code: 'MECH-BELT', name: 'Belt breakage' },
      { code: 'MECH-GEARBOX', name: 'Gearbox issues' },
    ],
  },
  {
    code: 'ELEC',
    name: 'Electrical',
    reasons: [
      { code: 'ELEC-MOTOR', name: 'Motor trip' },
      { code: 'ELEC-PLC', name: 'PLC fault' },
      { code: 'ELEC-WIRING', name: 'Wiring problem' },
    ],
  },
  {
    code: 'PNEU',
    name: 'Pneumatic',
    reasons: [
      { code: 'PNEU-LOW-AIR', name: 'Low air pressure' },
      { code: 'PNEU-LEAK', name: 'Air leak' },
      { code: 'PNEU-VALVE', name: 'Valve failure' },
    ],
  },
  {
    code: 'UTIL',
    name: 'Utility',
    reasons: [
      { code: 'UTIL-POWER', name: 'Power outage' },
      { code: 'UTIL-WATER', name: 'Low water pressure' },
      { code: 'UTIL-COMP', name: 'Compressor failure' },
    ],
  },
  {
    code: 'MAT',
    name: 'Material',
    reasons: [
      { code: 'MAT-BOTTLES', name: 'No bottles' },
      { code: 'MAT-CAPS', name: 'No caps' },
      { code: 'MAT-LABELS', name: 'No labels' },
      { code: 'MAT-SHRINK', name: 'No shrink film' },
    ],
  },
  {
    code: 'QUAL',
    name: 'Quality',
    reasons: [
      { code: 'QUAL-REJECT', name: 'Product rejected' },
      { code: 'QUAL-CONTAM', name: 'Contamination' },
      { code: 'QUAL-FILL', name: 'Fill volume issue' },
    ],
  },
  {
    code: 'PLAN',
    name: 'Planned',
    reasons: [
      { code: 'PLAN-CIP', name: 'Cleaning (CIP)' },
      { code: 'PLAN-PM', name: 'Preventive maintenance' },
      { code: 'PLAN-CO', name: 'Changeover' },
    ],
  },
  {
    code: 'OPER',
    name: 'Operator',
    reasons: [
      { code: 'OPER-SETTINGS', name: 'Incorrect settings' },
      { code: 'OPER-START', name: 'Delayed startup' },
      { code: 'OPER-HUMAN', name: 'Human error' },
      { code: 'OPER-STARTUP-LOSS', name: 'Line startup loss' },
      { code: 'OPER-END-LOSS', name: 'Line end loss' },
      { code: 'OPER-MANPOWER-DELAY', name: 'Manpower delay' },
    ],
  },
  {
    code: 'MANP',
    name: 'Manpower',
    reasons: [
      { code: 'MANP-DELAY', name: 'Manpower delay' },
      { code: 'MANP-SHORTAGE', name: 'Manpower shortage' },
      { code: 'MANP-ABSENT', name: 'Operator absent' },
      { code: 'MANP-LUNCH', name: 'Lunch / break' },
    ],
  },
  {
    code: 'PPL',
    name: 'Planned Production Loss',
    reasons: [
      { code: 'PPL-STARTUP', name: 'Line startup loss' },
      { code: 'PPL-END', name: 'Line end loss' },
      { code: 'PPL-CHANGEOVER', name: 'Changeover' },
      { code: 'PPL-CIP', name: 'Cleaning (CIP)' },
      { code: 'PPL-PM', name: 'Preventive maintenance' },
      { code: 'PPL-TRIAL', name: 'Trial / sample run' },
    ],
  },
];

async function main() {
  for (const cat of CATALOG) {
    const category = await prisma.downtimeCategory.upsert({
      where: { code: cat.code },
      update: { name: cat.name, deletedAt: null, isActive: true, description: `${cat.name} downtime` },
      create: { code: cat.code, name: cat.name, description: `${cat.name} downtime` },
    });
    for (const reason of cat.reasons) {
      await prisma.downtimeReason.upsert({
        where: { code: reason.code },
        update: {
          name: reason.name,
          categoryId: category.id,
          deletedAt: null,
          isActive: true,
        },
        create: {
          code: reason.code,
          name: reason.name,
          categoryId: category.id,
        },
      });
    }
    console.log(`Category ${cat.name}: ${cat.reasons.length} reasons`);
  }
  console.log('Downtime master ready.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
