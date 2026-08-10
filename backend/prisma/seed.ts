import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

function daysAgo(n: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

async function main() {
  console.log('Seeding database...');

  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.shiftClosing.deleteMany();
  await prisma.manpowerEntry.deleteMany();
  await prisma.changeoverEntry.deleteMany();
  await prisma.downtimeEntry.deleteMany();
  await prisma.productionEntry.deleteMany();
  await prisma.productionPlan.deleteMany();
  await prisma.appSetting.deleteMany();
  await prisma.machine.deleteMany();
  await prisma.sku.deleteMany();
  await prisma.product.deleteMany();
  await prisma.downtimeReason.deleteMany();
  await prisma.downtimeCategory.deleteMany();
  await prisma.changeoverType.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.productionLine.deleteMany();
  await prisma.user.deleteMany();
  await prisma.plant.deleteMany();

  const passwordHash = await bcrypt.hash('Password@123', 12);

  const plant = await prisma.plant.create({
    data: {
      code: 'PLT-01',
      name: 'Pune Manufacturing Plant',
      location: 'Pune, Maharashtra',
      timezone: 'Asia/Kolkata',
    },
  });

  const plant2 = await prisma.plant.create({
    data: {
      code: 'PLT-02',
      name: 'Chennai Packaging Plant',
      location: 'Chennai, Tamil Nadu',
      timezone: 'Asia/Kolkata',
    },
  });

  const admin = await prisma.user.create({
    data: {
      employeeId: 'EMP-001',
      email: 'admin@pms.local',
      passwordHash,
      firstName: 'Asha',
      lastName: 'Admin',
      role: Role.ADMIN,
      phone: '+91-9000000001',
    },
  });

  const manager = await prisma.user.create({
    data: {
      employeeId: 'EMP-002',
      email: 'manager@pms.local',
      passwordHash,
      firstName: 'Rahul',
      lastName: 'Manager',
      role: Role.PRODUCTION_MANAGER,
      plantId: plant.id,
      phone: '+91-9000000002',
    },
  });

  const supervisor = await prisma.user.create({
    data: {
      employeeId: 'EMP-HARESH',
      email: 'haresh@pms.local',
      passwordHash,
      firstName: 'Haresh',
      lastName: 'Supervisor',
      role: Role.LINE_SUPERVISOR,
      plantId: plant.id,
      phone: '+91-9000000003',
    },
  });

  const supervisor2 = await prisma.user.create({
    data: {
      employeeId: 'EMP-BHALU',
      email: 'bhalu@pms.local',
      passwordHash,
      firstName: 'Bhalu',
      lastName: 'Supervisor',
      role: Role.LINE_SUPERVISOR,
      plantId: plant.id,
      phone: '+91-9000000004',
    },
  });

  const shifts = await Promise.all([
    prisma.shift.create({ data: { code: 'A', name: 'Shift A', startTime: '06:00', endTime: '14:00' } }),
    prisma.shift.create({ data: { code: 'B', name: 'Shift B', startTime: '14:00', endTime: '22:00' } }),
    prisma.shift.create({ data: { code: 'C', name: 'Shift C', startTime: '22:00', endTime: '06:00' } }),
  ]);

  const line1 = await prisma.productionLine.create({
    data: {
      code: 'L1',
      name: 'Line 1 - Filling',
      plantId: plant.id,
      supervisorId: supervisor.id,
      capacityCph: 1200,
    },
  });

  const line2 = await prisma.productionLine.create({
    data: {
      code: 'L2',
      name: 'Line 2 - Packaging',
      plantId: plant.id,
      supervisorId: supervisor2.id,
      capacityCph: 900,
    },
  });

  await prisma.productionLine.create({
    data: {
      code: 'L3',
      name: 'Line 3 - Secondary Pack',
      plantId: plant2.id,
      capacityCph: 700,
    },
  });

  const machines = await Promise.all([
    prisma.machine.create({ data: { code: 'FILL-01', name: 'Filler #1', lineId: line1.id } }),
    prisma.machine.create({ data: { code: 'CAP-01', name: 'Capper #1', lineId: line1.id } }),
    prisma.machine.create({ data: { code: 'LAB-01', name: 'Labeler #1', lineId: line1.id } }),
    prisma.machine.create({ data: { code: 'CASE-01', name: 'Case Packer #1', lineId: line2.id } }),
    prisma.machine.create({ data: { code: 'WRAP-01', name: 'Wrapper #1', lineId: line2.id } }),
  ]);

  const products = await Promise.all([
    prisma.product.create({ data: { code: 'PRD-JUICE', name: 'Fruit Juice', description: 'Ready-to-drink juice' } }),
    prisma.product.create({ data: { code: 'PRD-WATER', name: 'Mineral Water', description: 'Packaged drinking water' } }),
    prisma.product.create({ data: { code: 'PRD-SODA', name: 'Sparkling Soda', description: 'Carbonated soft drink' } }),
  ]);

  const skus = await Promise.all([
    prisma.sku.create({ data: { code: 'SKU-J-1L', name: 'Juice 1L', productId: products[0].id, casesPerPallet: 40, netWeightKg: 12 } }),
    prisma.sku.create({ data: { code: 'SKU-J-500', name: 'Juice 500ml', productId: products[0].id, casesPerPallet: 60, netWeightKg: 8 } }),
    prisma.sku.create({ data: { code: 'SKU-W-1L', name: 'Water 1L', productId: products[1].id, casesPerPallet: 50, netWeightKg: 12 } }),
    prisma.sku.create({ data: { code: 'SKU-S-330', name: 'Soda 330ml', productId: products[2].id, casesPerPallet: 70, netWeightKg: 9 } }),
  ]);

  const catBreakdown = await prisma.downtimeCategory.create({
    data: { code: 'BD', name: 'Breakdown', description: 'Equipment failure' },
  });
  const catProcess = await prisma.downtimeCategory.create({
    data: { code: 'PR', name: 'Process', description: 'Process related stops' },
  });
  const catQuality = await prisma.downtimeCategory.create({
    data: { code: 'QL', name: 'Quality', description: 'Quality holds' },
  });
  const catPlanned = await prisma.downtimeCategory.create({
    data: { code: 'PL', name: 'Planned', description: 'Planned stops' },
  });

  const reasons = await Promise.all([
    prisma.downtimeReason.create({ data: { code: 'BD-MOTOR', name: 'Motor failure', categoryId: catBreakdown.id } }),
    prisma.downtimeReason.create({ data: { code: 'BD-SENSOR', name: 'Sensor fault', categoryId: catBreakdown.id } }),
    prisma.downtimeReason.create({ data: { code: 'PR-JAM', name: 'Material jam', categoryId: catProcess.id } }),
    prisma.downtimeReason.create({ data: { code: 'PR-STARVE', name: 'Material starvation', categoryId: catProcess.id } }),
    prisma.downtimeReason.create({ data: { code: 'QL-HOLD', name: 'Quality hold', categoryId: catQuality.id } }),
    prisma.downtimeReason.create({ data: { code: 'PL-CIP', name: 'CIP / Cleaning', categoryId: catPlanned.id } }),
  ]);

  const coTypes = await Promise.all([
    prisma.changeoverType.create({ data: { code: 'CO-SKU', name: 'SKU Change', standardMins: 25 } }),
    prisma.changeoverType.create({ data: { code: 'CO-FLAVOR', name: 'Flavor Change', standardMins: 45 } }),
    prisma.changeoverType.create({ data: { code: 'CO-SIZE', name: 'Size Change', standardMins: 60 } }),
    prisma.changeoverType.create({ data: { code: 'CO-LABEL', name: 'Label change', standardMins: 5 } }),
  ]);

  await prisma.appSetting.createMany({
    data: [
      { key: 'company.name', value: 'Acme Beverages Pvt Ltd', description: 'Company display name' },
      { key: 'oee.target', value: 85, description: 'Target OEE %' },
      { key: 'downtime.alertMinutes', value: 30, description: 'High downtime alert threshold' },
      { key: 'session.timeoutMinutes', value: 480, description: 'UI session timeout' },
    ],
  });

  // Sample production plans for last 14 days
  for (let i = 13; i >= 0; i--) {
    const date = daysAgo(i);
    for (const [lineIdx, line] of [line1, line2].entries()) {
      const shift = shifts[i % 2];
      const product = products[(i + lineIdx) % products.length];
      const sku = skus.find((s) => s.productId === product.id)!;
      const plannedCases = 8000 + (i % 5) * 400 + lineIdx * 500;
      const start = new Date(date);
      start.setHours(lineIdx === 0 ? 6 : 14, 0, 0, 0);
      const end = new Date(start);
      end.setHours(start.getHours() + 8);

      const plan = await prisma.productionPlan.create({
        data: {
          planNumber: String(1000 + i * 2 + lineIdx).padStart(6, '0'),
          productionDate: date,
          plantId: plant.id,
          lineId: line.id,
          shiftId: shift.id,
          productId: product.id,
          skuId: sku.id,
          batchNumber: `B${date.toISOString().slice(0, 10).replace(/-/g, '')}-${line.code}`,
          plannedCases,
          plannedOperatingMins: 480,
          plannedStartTime: start,
          plannedEndTime: end,
          plannedManpower: 12 + lineIdx * 2,
          supervisorId: line.supervisorId,
          status: i === 0 ? 'IN_PROGRESS' : 'COMPLETED',
          createdById: manager.id,
        },
      });

      // Hourly entries (8 hours)
      let actualTotal = 0;
      let goodTotal = 0;
      let rejectTotal = 0;
      for (let h = 0; h < 8; h++) {
        const hourStart = new Date(start);
        hourStart.setHours(start.getHours() + h);
        const hourEnd = new Date(hourStart);
        hourEnd.setHours(hourStart.getHours() + 1);
        const plannedHour = plannedCases / 8;
        const actual = Math.round(plannedHour * (0.85 + ((i + h) % 5) * 0.03));
        const reject = Math.round(actual * (0.01 + ((h % 3) * 0.005)));
        const good = actual - reject;
        actualTotal += actual;
        goodTotal += good;
        rejectTotal += reject;

        await prisma.productionEntry.create({
          data: {
            planId: plan.id,
            hourStart,
            hourEnd,
            plannedCases: plannedHour,
            actualCases: actual,
            goodCases: good,
            rejectCases: reject,
            lossCases: Math.max(0, plannedHour - actual),
            status: i === 0 && h >= 6 ? 'SUBMITTED' : 'APPROVED',
            createdById: line.supervisorId ?? supervisor.id,
            approvedById: i === 0 && h >= 6 ? null : manager.id,
            approvedAt: i === 0 && h >= 6 ? null : new Date(),
            remarks: h === 3 ? 'Minor speed loss' : null,
          },
        });
      }

      // Downtime samples
      if (i % 2 === 0) {
        const dtStart = new Date(start);
        dtStart.setHours(start.getHours() + 2, 15, 0, 0);
        const dtEnd = new Date(dtStart);
        dtEnd.setMinutes(dtEnd.getMinutes() + 20 + (i % 3) * 10);
        await prisma.downtimeEntry.create({
          data: {
            planId: plan.id,
            machineId: machines[lineIdx === 0 ? 0 : 3].id,
            categoryId: i % 4 === 0 ? catBreakdown.id : catProcess.id,
            reasonId: i % 4 === 0 ? reasons[0].id : reasons[2].id,
            startTime: dtStart,
            endTime: dtEnd,
            durationMins: (dtEnd.getTime() - dtStart.getTime()) / 60000,
            actionTaken: 'Corrective maintenance performed',
            remarks: 'Logged by supervisor',
            createdById: line.supervisorId ?? supervisor.id,
          },
        });
      }

      // Changeover every few days on line 1
      if (lineIdx === 0 && i % 3 === 0) {
        await prisma.changeoverEntry.create({
          data: {
            planId: plan.id,
            changeoverTypeId: coTypes[i % coTypes.length].id,
            fromProductId: products[0].id,
            toProductId: products[(i + 1) % products.length].id,
            kind: i % 6 === 0 ? 'UNPLANNED' : 'PLANNED',
            status: 'COMPLETED',
            standardMins: coTypes[i % coTypes.length].standardMins,
            actualMins: coTypes[i % coTypes.length].standardMins + (i % 4) * 5,
            reason: 'SKU rotation',
            createdById: supervisor.id,
          },
        });
      }

      await prisma.manpowerEntry.create({
        data: {
          planId: plan.id,
          headcount: 12 + lineIdx * 2,
          operators: 8,
          helpers: 4 + lineIdx * 2,
          createdById: line.supervisorId ?? supervisor.id,
        },
      });

      if (i !== 0) {
        await prisma.shiftClosing.create({
          data: {
            planId: plan.id,
            shiftId: shift.id,
            status: 'CLOSED',
            totalPlanned: plannedCases,
            totalActual: actualTotal,
            totalGood: goodTotal,
            totalReject: rejectTotal,
            totalDowntime: i % 2 === 0 ? 20 + (i % 3) * 10 : 0,
            closedAt: end,
            closedById: line.supervisorId ?? supervisor.id,
          },
        });
      }
    }
  }

  await prisma.notification.createMany({
    data: [
      {
        userId: manager.id,
        type: 'PENDING_APPROVAL',
        title: 'Pending production approvals',
        message: 'There are hourly production entries awaiting approval.',
      },
      {
        userId: admin.id,
        type: 'SYSTEM',
        title: 'Welcome to PMS',
        message: 'Production Management System is ready. Seed data loaded.',
      },
      {
        userId: supervisor.id,
        type: 'TARGET_MISSED',
        title: 'Review Line 1 performance',
        message: 'Yesterday achievement dipped below target on Shift A.',
      },
    ],
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: 'SEED',
      entity: 'System',
      after: { message: 'Initial seed completed' },
    },
  });

  console.log('Seed completed.');
  console.log('Demo users (password: Password@123):');
  console.log('  admin@pms.local');
  console.log('  manager@pms.local');
  console.log('  haresh@pms.local');
  console.log('  bhalu@pms.local');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
