import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Password@123', 12);

  for (const u of [
    { email: 'admin@pms.local', firstName: 'Asha', lastName: 'Admin', role: 'ADMIN' as const, employeeId: 'EMP-001' },
    { email: 'manager@pms.local', firstName: 'Rahul', lastName: 'Manager', role: 'PRODUCTION_MANAGER' as const, employeeId: 'EMP-002' },
    { email: 'haresh@pms.local', firstName: 'Haresh', lastName: 'Supervisor', role: 'LINE_SUPERVISOR' as const, employeeId: 'EMP-HARESH' },
    { email: 'bhalu@pms.local', firstName: 'Bhalu', lastName: 'Supervisor', role: 'LINE_SUPERVISOR' as const, employeeId: 'EMP-BHALU' },
  ]) {
    const plant = await prisma.plant.findFirst({ where: { deletedAt: null }, orderBy: { createdAt: 'asc' } });
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        employeeId: u.employeeId,
        passwordHash,
        isActive: true,
        deletedAt: null,
        plantId: plant?.id ?? undefined,
      },
      create: {
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        employeeId: u.employeeId,
        passwordHash,
        isActive: true,
        plantId: plant?.id,
      },
    });
    console.log('Restored', u.email);
  }

  const users = await prisma.user.findMany({
    where: {
      email: { in: ['admin@pms.local', 'manager@pms.local', 'haresh@pms.local', 'bhalu@pms.local'] },
    },
    select: { email: true, isActive: true, deletedAt: true, role: true },
  });
  console.log(users);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
