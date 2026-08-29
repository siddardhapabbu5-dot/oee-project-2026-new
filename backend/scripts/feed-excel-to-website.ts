/**
 * Feed entire Production Plan.xlsx into the live PMS website database.
 * Sheets: Production Plan, Production Entries, Change over
 */
import ExcelJS from 'exceljs';
import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';
import { canonicalDowntimeReasonName } from '../src/utils/downtimeReasonName.ts';

const prisma = new PrismaClient();
const FILE =
  'c:/Users/harsh/OneDrive/Documents/Desktop/Siddhu/Water/Sample OEE Temp/Production Plan.xlsx';

function cellValue(cell: ExcelJS.Cell): unknown {
  const v = cell.value as unknown;
  if (v == null) return null;
  if (typeof v !== 'object') return v;
  if (v instanceof Date) return v;
  const any = v as {
    text?: string;
    result?: unknown;
    richText?: Array<{ text: string }>;
    sharedFormula?: string;
  };
  if (any.result != null) return any.result;
  if (any.text) return any.text;
  if (any.richText) return any.richText.map((t) => t.text).join('');
  return null;
}

function asDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateOnly(d: Date) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function combineDateAndTime(base: Date, timeVal: unknown, fallbackHour = 9): Date {
  const out = new Date(base);
  if (timeVal instanceof Date) {
    out.setHours(timeVal.getHours(), timeVal.getMinutes(), timeVal.getSeconds(), 0);
    return out;
  }
  out.setHours(fallbackHour, 0, 0, 0);
  return out;
}

function slug(s: string) {
  return s
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseChangeoverDate(v: unknown): Date | null {
  if (v instanceof Date) return dateOnly(v);
  if (!v) return null;
  const s = String(v).trim();
  // dd.MM.yyyy
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return asDate(v) ? dateOnly(asDate(v)!) : null;
}

async function main() {
  console.log('Feeding Excel into website DB...\n');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);

  const passwordHash = await bcrypt.hash('Password@123', 12);

  const plant = await prisma.plant.upsert({
    where: { code: 'NAK' },
    update: { name: 'Nakshatra', deletedAt: null, isActive: true },
    create: { code: 'NAK', name: 'Nakshatra', location: 'Nakshatra Plant' },
  });

  const shift = await prisma.shift.upsert({
    where: { code: 'G' },
    update: { name: 'Shift G (General)', startTime: '09:00', endTime: '18:00', deletedAt: null, isActive: true },
    create: { code: 'G', name: 'Shift G (General)', startTime: '09:00', endTime: '18:00' },
  });

  async function ensureUser(fullName: string, role: Role = Role.LINE_SUPERVISOR) {
    const name = fullName.trim();
    if (!name) return null;
    const [firstName, ...rest] = name.split(/\s+/);
    const lastName = rest.join(' ') || 'User';
    const email = `${slug(name).toLowerCase()}@pms.local`;
    const employeeId = `EMP-${slug(name).slice(0, 16)}`;
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { employeeId }], deletedAt: null },
    });
    if (existing) return existing;
    return prisma.user.create({
      data: {
        employeeId,
        email,
        passwordHash,
        firstName,
        lastName,
        role,
        plantId: plant.id,
      },
    });
  }

  const siddardha = await ensureUser('Siddardha Pabbu');
  const prasad = await ensureUser('Prasad');
  const admin = await prisma.user.findFirst({ where: { email: 'admin@pms.local' } });
  const actorId = admin?.id ?? siddardha!.id;

  const line = await prisma.productionLine.upsert({
    where: { code: 'LINE-01' },
    update: {
      name: 'Line-01',
      plantId: plant.id,
      supervisorId: siddardha!.id,
      capacityCph: 200,
      deletedAt: null,
      isActive: true,
    },
    create: {
      code: 'LINE-01',
      name: 'Line-01',
      plantId: plant.id,
      supervisorId: siddardha!.id,
      capacityCph: 200,
    },
  });

  async function ensureProductSku(productName: string, sizeCode: string) {
    const pname = productName.trim();
    const size = String(sizeCode || 'STD').trim();
    const productCode = `PRD-${slug(pname)}`;
    const skuCode = `SKU-${slug(pname)}-${slug(size)}`;
    const product = await prisma.product.upsert({
      where: { code: productCode },
      update: { name: pname, deletedAt: null, isActive: true },
      create: { code: productCode, name: pname, uom: 'CASE' },
    });
    const sku = await prisma.sku.upsert({
      where: { code: skuCode },
      update: { name: `${pname} ${size}`, productId: product.id, deletedAt: null, isActive: true },
      create: { code: skuCode, name: `${pname} ${size}`, productId: product.id },
    });
    return { product, sku };
  }

  async function ensureMachine(name: string) {
    const code = `M-${slug(name).slice(0, 20)}`;
    return prisma.machine.upsert({
      where: { code },
      update: { name, lineId: line.id, deletedAt: null, isActive: true },
      create: { code, name, lineId: line.id },
    });
  }

  async function ensureDowntime(categoryName: string, reasonName: string) {
    const catCode = `DC-${slug(categoryName).slice(0, 20)}`;
    const category = await prisma.downtimeCategory.upsert({
      where: { code: catCode },
      update: { name: categoryName.trim(), deletedAt: null, isActive: true },
      create: { code: catCode, name: categoryName.trim() },
    });
    const canonical = canonicalDowntimeReasonName(reasonName.trim());
    const existing = await prisma.downtimeReason.findFirst({
      where: { deletedAt: null, name: { equals: canonical, mode: 'insensitive' } },
    });
    if (existing) {
      return { category, reason: existing };
    }
    const reasonCode = `DR-${slug(categoryName).slice(0, 8)}-${slug(canonical).slice(0, 16)}`;
    const reason = await prisma.downtimeReason.upsert({
      where: { code: reasonCode },
      update: { name: canonical, categoryId: category.id, deletedAt: null, isActive: true },
      create: { code: reasonCode, name: canonical, categoryId: category.id },
    });
    return { category, reason };
  }

  async function ensureChangeoverType(name: string, standardMins: number) {
    const code = `CO-${slug(name).slice(0, 24)}`;
    return prisma.changeoverType.upsert({
      where: { code },
      update: { name, standardMins, deletedAt: null, isActive: true },
      create: { code, name, standardMins },
    });
  }

  // -------- 1) Production plans --------
  const planSheet = wb.getWorksheet('Procution Plan') ?? wb.worksheets[0];
  let plansCreated = 0;
  let plansSkipped = 0;
  const planByWorkOrder = new Map<string, string>();

  for (let r = 2; r <= (planSheet?.rowCount || 0); r++) {
    const row = planSheet!.getRow(r);
    const productionDateRaw = asDate(cellValue(row.getCell(1)));
    if (!productionDateRaw) continue;

    const sizeCode = String(cellValue(row.getCell(5)) ?? '').trim();
    const productName = String(cellValue(row.getCell(6)) ?? '').trim();
    const batchNo = String(cellValue(row.getCell(7)) ?? '').trim();
    const plannedCases = Number(cellValue(row.getCell(8)) ?? 0);
    const plannedMins = Number(cellValue(row.getCell(9)) ?? 480);
    const startTimeVal = cellValue(row.getCell(10));
    const endTimeVal = cellValue(row.getCell(11));
    const manpower = Number(cellValue(row.getCell(12)) ?? 5);
    const workOrder = String(cellValue(row.getCell(13)) ?? '').trim();
    const supervisorName = String(cellValue(row.getCell(14)) ?? '').trim();
    if (!productName || !plannedCases) continue;

    const d = dateOnly(productionDateRaw);
    const { product, sku } = await ensureProductSku(productName, sizeCode);
    const supervisor =
      supervisorName.toLowerCase().includes('prasad') ? prasad : await ensureUser(supervisorName || 'Siddardha Pabbu');

    let plan = await prisma.productionPlan.findFirst({
      where: { deletedAt: null, lineId: line.id, batchNumber: batchNo || workOrder, productionDate: d },
    });

    if (!plan) {
      const count = await prisma.productionPlan.count();
      plan = await prisma.productionPlan.create({
        data: {
          planNumber: `PP-NAK-${String(count + 1).padStart(5, '0')}`,
          productionDate: d,
          plantId: plant.id,
          lineId: line.id,
          shiftId: shift.id,
          productId: product.id,
          skuId: sku.id,
          batchNumber: batchNo || workOrder,
          plannedCases,
          plannedOperatingMins: plannedMins || 480,
          plannedStartTime: combineDateAndTime(productionDateRaw, startTimeVal, 9),
          plannedEndTime: combineDateAndTime(productionDateRaw, endTimeVal, 18),
          plannedManpower: manpower || 5,
          supervisorId: supervisor?.id,
          status: 'SCHEDULED',
          remarks: `Work Order: ${workOrder} | Imported from Production Plan.xlsx`,
          createdById: actorId,
        },
      });
      plansCreated += 1;
    } else {
      plansSkipped += 1;
    }
    if (workOrder) planByWorkOrder.set(workOrder, plan.id);
  }
  console.log(`Plans: created ${plansCreated}, existing ${plansSkipped}`);

  // -------- 2) Production entries + downtime (July 1 sample) --------
  const entrySheet = wb.getWorksheet('Production Entires');
  let entriesCreated = 0;
  let downtimeCreated = 0;

  type Carry = {
    workOrder: string;
    productName: string;
    sizeCode: string;
    batchNo: string;
    plannedCases: number;
  };
  let carry: Carry | null = null;

  if (entrySheet) {
    for (let r = 2; r <= Math.min(entrySheet.rowCount || 0, 20); r++) {
      const row = entrySheet.getRow(r);
      const productionDateRaw = asDate(cellValue(row.getCell(1)));
      if (!productionDateRaw) continue;

      // Skip KPI section (no hour start)
      const startVal = cellValue(row.getCell(11));
      const endVal = cellValue(row.getCell(12));
      const hourTarget = Number(cellValue(row.getCell(13)) ?? 0);
      const actualCases = Number(cellValue(row.getCell(14)) ?? NaN);
      const holdCases = Number(cellValue(row.getCell(16)) ?? 0);
      const goodCasesRaw = Number(cellValue(row.getCell(17)) ?? NaN);

      const workOrder = String(cellValue(row.getCell(10)) ?? '').trim() || carry?.workOrder || '';
      const productName = String(cellValue(row.getCell(7)) ?? '').trim() || carry?.productName || '';
      const sizeCode = String(cellValue(row.getCell(5)) ?? '').trim() || carry?.sizeCode || '';
      const batchNo = String(cellValue(row.getCell(8)) ?? '').trim() || carry?.batchNo || '';
      const plannedCases = Number(cellValue(row.getCell(9)) ?? carry?.plannedCases ?? 0);

      if (workOrder || productName) {
        carry = {
          workOrder,
          productName,
          sizeCode,
          batchNo,
          plannedCases,
        };
      }

      // Downtime-only continuation rows (no production hour)
      const machineName = String(cellValue(row.getCell(22)) ?? '').trim();
      const categoryName = String(cellValue(row.getCell(23)) ?? '').trim();
      const reasonName = canonicalDowntimeReasonName(String(cellValue(row.getCell(24)) ?? '').trim());
      const actionTaken = String(cellValue(row.getCell(25)) ?? '').trim();
      const dtStartVal = cellValue(row.getCell(19));
      const dtEndVal = cellValue(row.getCell(20));
      const durationMins = Number(cellValue(row.getCell(21)) ?? cellValue(row.getCell(18)) ?? 0);

      const planId =
        (workOrder && planByWorkOrder.get(workOrder)) ||
        (carry?.workOrder && planByWorkOrder.get(carry.workOrder)) ||
        null;

      if (!planId) continue;

      // Production hourly entry when start/end + cases present
      if (startVal && endVal && !Number.isNaN(actualCases) && hourTarget > 0) {
        const hourStart = combineDateAndTime(productionDateRaw, startVal, 9);
        const hourEnd = combineDateAndTime(productionDateRaw, endVal, 10);
        const goodCases = !Number.isNaN(goodCasesRaw) ? goodCasesRaw : Math.max(0, actualCases - holdCases);
        const rejectCases = Math.max(0, holdCases || actualCases - goodCases);
        const lossCases = Math.max(0, hourTarget - actualCases);

        const exists = await prisma.productionEntry.findFirst({
          where: { planId, hourStart, deletedAt: null },
        });
        if (!exists) {
          await prisma.productionEntry.create({
            data: {
              planId,
              hourStart,
              hourEnd,
              plannedCases: hourTarget,
              actualCases,
              goodCases,
              rejectCases,
              lossCases,
              remarks: 'Imported from Production Entires sheet',
              status: 'APPROVED',
              createdById: siddardha!.id,
              approvedById: actorId,
              approvedAt: new Date(),
            },
          });
          entriesCreated += 1;
        }
      }

      // Downtime row
      if (machineName && categoryName && reasonName && durationMins > 0) {
        const machine = await ensureMachine(machineName);
        const { category, reason } = await ensureDowntime(categoryName, reasonName);
        const startTime = combineDateAndTime(productionDateRaw, dtStartVal, 9);
        const endTime = dtEndVal
          ? combineDateAndTime(productionDateRaw, dtEndVal, 9)
          : new Date(startTime.getTime() + durationMins * 60000);

        const existsDt = await prisma.downtimeEntry.findFirst({
          where: {
            planId,
            machineId: machine.id,
            startTime,
            deletedAt: null,
          },
        });
        if (!existsDt) {
          await prisma.downtimeEntry.create({
            data: {
              planId,
              machineId: machine.id,
              categoryId: category.id,
              reasonId: reason.id,
              startTime,
              endTime,
              durationMins,
              actionTaken: actionTaken || null,
              remarks: 'Imported from Production Entires sheet',
              createdById: siddardha!.id,
            },
          });
          downtimeCreated += 1;
        }
      }
    }

    // Mark July 1 plan in progress/completed based on entries
    const july1PlanId = planByWorkOrder.get('123456');
    if (july1PlanId) {
      await prisma.productionPlan.update({
        where: { id: july1PlanId },
        data: { status: 'COMPLETED' },
      });
      const entries = await prisma.productionEntry.findMany({ where: { planId: july1PlanId, deletedAt: null } });
      const dts = await prisma.downtimeEntry.findMany({ where: { planId: july1PlanId, deletedAt: null } });
      await prisma.shiftClosing.upsert({
        where: { planId: july1PlanId },
        create: {
          planId: july1PlanId,
          shiftId: shift.id,
          status: 'CLOSED',
          totalPlanned: entries.reduce((s, e) => s + e.plannedCases, 0),
          totalActual: entries.reduce((s, e) => s + e.actualCases, 0),
          totalGood: entries.reduce((s, e) => s + e.goodCases, 0),
          totalReject: entries.reduce((s, e) => s + e.rejectCases, 0),
          totalDowntime: dts.reduce((s, e) => s + e.durationMins, 0),
          remarks: 'Imported from Excel sample day',
          closedAt: new Date('2026-07-01T18:00:00'),
          closedById: siddardha!.id,
        },
        update: {
          status: 'CLOSED',
          totalPlanned: entries.reduce((s, e) => s + e.plannedCases, 0),
          totalActual: entries.reduce((s, e) => s + e.actualCases, 0),
          totalGood: entries.reduce((s, e) => s + e.goodCases, 0),
          totalReject: entries.reduce((s, e) => s + e.rejectCases, 0),
          totalDowntime: dts.reduce((s, e) => s + e.durationMins, 0),
        },
      });
    }
  }
  console.log(`Hourly entries: ${entriesCreated}`);
  console.log(`Downtime entries: ${downtimeCreated}`);

  // -------- 3) Changeovers --------
  const coSheet = wb.getWorksheet('Change over');
  let changeoversCreated = 0;

  function parseProductLabel(label: string) {
    // e.g. "Lavin orange-500 Ml" or "Golden Drop-1000 Ml"
    const cleaned = label.replace(/\s+/g, ' ').trim();
    const m = cleaned.match(/^(.*?)[-\s]+(\d+\s*ML)$/i);
    if (m) return { name: m[1].trim(), size: m[2].replace(/\s+/g, ' ').toUpperCase() };
    return { name: cleaned, size: 'STD' };
  }

  if (coSheet) {
    for (let r = 2; r <= (coSheet.rowCount || 0); r++) {
      const row = coSheet.getRow(r);
      const d = parseChangeoverDate(cellValue(row.getCell(1)));
      if (!d) continue;

      const fromLabel = String(cellValue(row.getCell(3)) ?? '').trim();
      const toLabel = String(cellValue(row.getCell(4)) ?? '').trim();
      if (!fromLabel || !toLabel) continue;

      const standardMins = Number(cellValue(row.getCell(5)) ?? 20);
      const startVal = cellValue(row.getCell(6));
      const endVal = cellValue(row.getCell(7));
      const actualMins = Number(cellValue(row.getCell(8)) ?? standardMins);
      const typeName = String(cellValue(row.getCell(9)) ?? 'Changeover').trim();
      const planKind = String(cellValue(row.getCell(10)) ?? '').toLowerCase();
      const reason = String(cellValue(row.getCell(11)) ?? '').trim();
      const supervisorName = String(cellValue(row.getCell(12)) ?? '').trim();
      const remarks = String(cellValue(row.getCell(13)) ?? '').trim();

      const from = parseProductLabel(fromLabel);
      const to = parseProductLabel(toLabel);
      const fromPs = await ensureProductSku(from.name, from.size);
      const toPs = await ensureProductSku(to.name, to.size);
      const coType = await ensureChangeoverType(typeName, standardMins);

      // Attach to plan on that date for LINE-01
      const plan = await prisma.productionPlan.findFirst({
        where: { deletedAt: null, lineId: line.id, productionDate: d },
        orderBy: { createdAt: 'asc' },
      });
      if (!plan) continue;

      const exists = await prisma.changeoverEntry.findFirst({
        where: {
          planId: plan.id,
          fromProductId: fromPs.product.id,
          toProductId: toPs.product.id,
          deletedAt: null,
        },
      });
      if (exists) continue;

      const creator =
        supervisorName.toLowerCase().includes('prasad') ? prasad : siddardha;

      await prisma.changeoverEntry.create({
        data: {
          planId: plan.id,
          changeoverTypeId: coType.id,
          fromProductId: fromPs.product.id,
          toProductId: toPs.product.id,
          kind: planKind.includes('unplanned') ? 'UNPLANNED' : 'PLANNED',
          status: 'COMPLETED',
          standardMins,
          actualMins,
          reason: reason || null,
          remarks: remarks || 'Imported from Change over sheet',
          startTime: combineDateAndTime(d, startVal, 9),
          endTime: combineDateAndTime(d, endVal, 9),
          createdById: creator!.id,
        },
      });
      changeoversCreated += 1;
    }
  }
  console.log(`Changeovers: ${changeoversCreated}`);

  // Manpower for July 1
  const july1 = planByWorkOrder.get('123456');
  if (july1) {
    const mp = await prisma.manpowerEntry.findFirst({ where: { planId: july1, deletedAt: null } });
    if (!mp) {
      await prisma.manpowerEntry.create({
        data: {
          planId: july1,
          headcount: 5,
          operators: 3,
          helpers: 2,
          remarks: 'Imported from Excel',
          createdById: siddardha!.id,
        },
      });
    }
  }

  await prisma.notification.create({
    data: {
      userId: actorId,
      type: 'SYSTEM',
      title: 'Excel data fed',
      message:
        'Production Plan.xlsx loaded: Nakshatra Line-01 plans, July 1 hourly production/downtime, and changeovers.',
    },
  });

  console.log('\nFeed complete. Refresh the website:');
  console.log('  Plans:       http://localhost:5174/plans');
  console.log('  Shop floor:  http://localhost:5174/shop-floor');
  console.log('  Dashboard:   http://localhost:5174/dashboard');
  console.log('  Changeovers: http://localhost:5174/changeover-analysis');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
