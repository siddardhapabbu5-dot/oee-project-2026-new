/**
 * Import Production Plan.xlsx into the PMS database.
 * Creates/upserts plant, line, shift, products, SKUs, supervisors, then plans.
 */
import ExcelJS from 'exceljs';
import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();
const FILE =
  'c:/Users/harsh/OneDrive/Documents/Desktop/Siddhu/Water/Sample OEE Temp/Production Plan.xlsx';

function cellValue(cell: ExcelJS.Cell): unknown {
  const v = cell.value;
  if (v == null) return null;
  if (typeof v !== 'object') return v;
  if (v instanceof Date) return v;
  const any = v as { text?: string; result?: unknown; richText?: Array<{ text: string }> };
  if (any.text) return any.text;
  if (any.result != null) return any.result;
  if (any.richText) return any.richText.map((t) => t.text).join('');
  return String(v);
}

function asDate(v: unknown): Date {
  if (v instanceof Date) return v;
  return new Date(String(v));
}

function asTimeOnDate(productionDate: Date, timeVal: unknown, fallbackHour: number): Date {
  const d = new Date(productionDate);
  if (timeVal instanceof Date) {
    d.setHours(timeVal.getHours(), timeVal.getMinutes(), 0, 0);
    return d;
  }
  d.setHours(fallbackHour, 0, 0, 0);
  return d;
}

function slug(s: string) {
  return s
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function main() {
  console.log('Reading Excel...');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const ws = wb.getWorksheet('Procution Plan') ?? wb.worksheets[0];
  if (!ws) throw new Error('Production Plan sheet not found');

  const passwordHash = await bcrypt.hash('Password@123', 12);

  // Masters from Excel
  const plant = await prisma.plant.upsert({
    where: { code: 'NAK' },
    update: { name: 'Nakshatra', location: 'Nakshatra Plant', deletedAt: null, isActive: true },
    create: { code: 'NAK', name: 'Nakshatra', location: 'Nakshatra Plant' },
  });

  const shift = await prisma.shift.upsert({
    where: { code: 'G' },
    update: { name: 'Shift G (General)', startTime: '09:00', endTime: '18:00', deletedAt: null, isActive: true },
    create: { code: 'G', name: 'Shift G (General)', startTime: '09:00', endTime: '18:00' },
  });

  const supervisors = new Map<string, string>(); // name -> id
  async function ensureSupervisor(fullName: string) {
    const name = fullName.trim();
    if (!name) return null;
    if (supervisors.has(name)) return supervisors.get(name)!;

    const [firstName, ...rest] = name.split(/\s+/);
    const lastName = rest.join(' ') || 'Supervisor';
    const email = `${slug(name).toLowerCase()}@pms.local`;
    const employeeId = `SUP-${slug(name).slice(0, 12)}`;

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { employeeId }], deletedAt: null },
    });
    if (existing) {
      supervisors.set(name, existing.id);
      return existing.id;
    }

    const user = await prisma.user.create({
      data: {
        employeeId,
        email,
        passwordHash,
        firstName,
        lastName,
        role: Role.LINE_SUPERVISOR,
        plantId: plant.id,
      },
    });
    supervisors.set(name, user.id);
    console.log(`  Supervisor created: ${name} (${email})`);
    return user.id;
  }

  // Prefetch supervisors Siddardha / Prasad
  const siddardhaId = await ensureSupervisor('Siddardha Pabbu');
  await ensureSupervisor('Prasad');

  const line = await prisma.productionLine.upsert({
    where: { code: 'LINE-01' },
    update: {
      name: 'Line-01',
      plantId: plant.id,
      supervisorId: siddardhaId,
      capacityCph: 200,
      deletedAt: null,
      isActive: true,
    },
    create: {
      code: 'LINE-01',
      name: 'Line-01',
      plantId: plant.id,
      supervisorId: siddardhaId,
      capacityCph: 200,
    },
  });

  // Product catalog: product name + size code as SKU
  async function ensureProductSku(productName: string, sizeCode: string) {
    const pname = productName.trim();
    const size = String(sizeCode).trim();
    const productCode = `PRD-${slug(pname)}`;
    const skuCode = `SKU-${slug(pname)}-${slug(size)}`;

    const product = await prisma.product.upsert({
      where: { code: productCode },
      update: { name: pname, deletedAt: null, isActive: true },
      create: { code: productCode, name: pname, description: `${pname} beverage`, uom: 'CASE' },
    });

    const sku = await prisma.sku.upsert({
      where: { code: skuCode },
      update: { name: `${pname} ${size}`, productId: product.id, deletedAt: null, isActive: true },
      create: {
        code: skuCode,
        name: `${pname} ${size}`,
        productId: product.id,
      },
    });

    return { product, sku };
  }

  let created = 0;
  let skipped = 0;

  for (let r = 2; r <= (ws.rowCount || 0); r++) {
    const row = ws.getRow(r);
    const productionDateRaw = cellValue(row.getCell(1));
    if (!productionDateRaw) continue;

    const plantName = String(cellValue(row.getCell(2)) ?? '').trim();
    const lineName = String(cellValue(row.getCell(3)) ?? '').trim();
    const shiftCode = String(cellValue(row.getCell(4)) ?? '').trim();
    const productCode = String(cellValue(row.getCell(5)) ?? '').trim(); // size e.g. 500 ML
    const productName = String(cellValue(row.getCell(6)) ?? '').trim();
    const batchNo = String(cellValue(row.getCell(7)) ?? '').trim();
    const plannedCases = Number(cellValue(row.getCell(8)) ?? 0);
    const plannedMins = Number(cellValue(row.getCell(9)) ?? 480);
    const startTimeVal = cellValue(row.getCell(10));
    const endTimeVal = cellValue(row.getCell(11));
    const manpower = Number(cellValue(row.getCell(12)) ?? 5);
    const workOrder = String(cellValue(row.getCell(13)) ?? '').trim();
    const supervisorName = String(cellValue(row.getCell(14)) ?? '').trim();

    if (!productName || !plannedCases) {
      skipped += 1;
      continue;
    }

    const productionDate = asDate(productionDateRaw);
    // Normalize to date-only UTC noon to avoid timezone day shifts in display
    const dateOnly = new Date(Date.UTC(productionDate.getFullYear(), productionDate.getMonth(), productionDate.getDate()));

    const { product, sku } = await ensureProductSku(productName, productCode || 'STD');
    const supervisorId = supervisorName ? await ensureSupervisor(supervisorName) : siddardhaId;

    const plannedStartTime = asTimeOnDate(productionDate, startTimeVal, 9);
    const plannedEndTime = asTimeOnDate(productionDate, endTimeVal, 18);

    // Avoid duplicates by work order in remarks or same date+batch+line
    const existing = await prisma.productionPlan.findFirst({
      where: {
        deletedAt: null,
        lineId: line.id,
        batchNumber: batchNo || workOrder,
        productionDate: dateOnly,
      },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    const count = await prisma.productionPlan.count();
    const planNumber = `PP-NAK-${String(count + 1).padStart(5, '0')}`;

    await prisma.productionPlan.create({
      data: {
        planNumber,
        productionDate: dateOnly,
        plantId: plant.id,
        lineId: line.id,
        shiftId: shift.id,
        productId: product.id,
        skuId: sku.id,
        batchNumber: batchNo || workOrder || `B${r}`,
        plannedCases,
        plannedOperatingMins: plannedMins || 480,
        plannedStartTime,
        plannedEndTime,
        plannedManpower: manpower || 5,
        supervisorId,
        status: 'SCHEDULED',
        remarks: [
          workOrder ? `Work Order: ${workOrder}` : null,
          `Imported from Production Plan.xlsx`,
          plantName && plantName !== plant.name ? `Plant: ${plantName}` : null,
          lineName ? `Line: ${lineName}` : null,
          shiftCode ? `Shift: ${shiftCode}` : null,
        ]
          .filter(Boolean)
          .join(' | '),
      },
    });
    created += 1;
    console.log(`  + ${planNumber} ${dateOnly.toISOString().slice(0, 10)} ${productName} ${productCode} WO=${workOrder}`);
  }

  console.log(`\nDone. Created ${created} plans, skipped ${skipped}.`);
  console.log('Plant: Nakshatra | Line: LINE-01 | Shift: G');
  console.log('Open http://localhost:5174/plans to view.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
