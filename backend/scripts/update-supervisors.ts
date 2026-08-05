import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Password@123', 12);
  const nakshatra = await prisma.plant.findFirst({
    where: { name: { contains: 'Nakshatra', mode: 'insensitive' }, deletedAt: null },
  });
  const plantId =
    nakshatra?.id ?? (await prisma.plant.findFirst({ where: { deletedAt: null } }))?.id;
  if (!plantId) throw new Error('No plant found');

  await prisma.user.updateMany({
    where: {
      OR: [
        { email: 'supervisor@pms.local' },
        { email: 'supervisor2@pms.local' },
        { firstName: 'Neha' },
        { firstName: 'Vikram' },
      ],
    },
    data: { isActive: false, deletedAt: new Date() },
  });
  console.log('Removed Neha & Vikram');

  for (const u of [
    { email: 'haresh@pms.local', firstName: 'Haresh', lastName: 'Supervisor', employeeId: 'EMP-HARESH' },
    { email: 'bhalu@pms.local', firstName: 'Bhalu', lastName: 'Supervisor', employeeId: 'EMP-BHALU' },
  ]) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        firstName: u.firstName,
        lastName: u.lastName,
        employeeId: u.employeeId,
        role: 'LINE_SUPERVISOR',
        isActive: true,
        deletedAt: null,
        plantId,
        passwordHash,
      },
      create: {
        ...u,
        role: 'LINE_SUPERVISOR',
        plantId,
        passwordHash,
        isActive: true,
      },
    });
    console.log('Added', u.firstName);
  }

  const remaining = await prisma.user.findMany({
    where: { role: 'LINE_SUPERVISOR', deletedAt: null, isActive: true },
    select: { firstName: true, lastName: true, email: true },
    orderBy: { firstName: 'asc' },
  });
  console.log('Active supervisors:', remaining);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
