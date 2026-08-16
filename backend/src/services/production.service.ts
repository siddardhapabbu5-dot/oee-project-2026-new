import type { Prisma, EntryStatus, ReworkZone } from '@prisma/client';
import ExcelJS from 'exceljs';
import { prisma } from '../config/prisma.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../utils/errors.js';
import { writeAuditLog } from '../utils/audit.js';
import { calcLoss, minutesBetween } from '../utils/oee.js';
import { calendarDateRange, parseCalendarDate, toCalendarDate } from '../utils/dates.js';
import { normalizeReworkByZone, sumReworkCases, type ReworkByZoneInput } from '../utils/reworkZones.js';
import type { Request } from 'express';
import type { AuthUser } from '../middleware/auth.js';

const planInclude = {
  plant: true,
  line: true,
  shift: true,
  product: { include: { brand: true } },
  sku: true,
  supervisor: { select: { id: true, firstName: true, lastName: true, email: true } },
  productionEntries: {
    where: { deletedAt: null },
    orderBy: { hourStart: 'asc' as const },
    include: {
      reworkEntries: { where: { deletedAt: null }, orderBy: { zone: 'asc' as const } },
    },
  },
  downtimeEntries: {
    where: { deletedAt: null },
    orderBy: { startTime: 'asc' as const },
    include: {
      category: true,
      reason: true,
      machine: { select: { id: true, code: true, name: true } },
    },
  },
  changeoverEntries: {
    where: { deletedAt: null },
    orderBy: { startTime: 'asc' as const },
    include: {
      fromProduct: { select: { id: true, name: true } },
      toProduct: { select: { id: true, name: true } },
      fromSku: { select: { id: true, code: true, name: true, packVolume: true } },
      toSku: { select: { id: true, code: true, name: true, packVolume: true } },
      changeoverType: { select: { id: true, name: true, standardMins: true } },
    },
  },
  manpowerEntries: { where: { deletedAt: null } },
  shiftClosings: true,
} satisfies Prisma.ProductionPlanInclude;

function scopePlans(user?: AuthUser): Prisma.ProductionPlanWhereInput {
  if (!user) return {};
  if (user.role === 'LINE_SUPERVISOR') {
    return {
      OR: [{ supervisorId: user.id }, { line: { supervisorId: user.id } }],
    };
  }
  if (user.role === 'PRODUCTION_MANAGER' && user.plantId) {
    return { plantId: user.plantId };
  }
  return {};
}

export async function listPlans(
  params: {
    skip: number;
    take: number;
    search?: string;
    plantId?: string;
    lineId?: string;
    shiftId?: string;
    from?: string;
    to?: string;
    status?: string;
  },
  user?: AuthUser,
) {
  const where: Prisma.ProductionPlanWhereInput = {
    deletedAt: null,
    ...scopePlans(user),
    ...(params.plantId ? { plantId: params.plantId } : {}),
    ...(params.lineId ? { lineId: params.lineId } : {}),
    ...(params.shiftId ? { shiftId: params.shiftId } : {}),
    ...(params.status ? { status: params.status as never } : {}),
    ...(params.from || params.to
      ? {
          productionDate: {
            ...(params.from ? { gte: parseCalendarDate(params.from) } : {}),
            ...(params.to
              ? { lte: new Date(`${toCalendarDate(params.to)}T23:59:59.999Z`) }
              : {}),
          },
        }
      : {}),
    ...(params.search
      ? {
          OR: [
            { planNumber: { contains: params.search, mode: 'insensitive' } },
            { batchNumber: { contains: params.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.productionPlan.count({ where }),
    prisma.productionPlan.findMany({
      where,
      skip: params.skip,
      take: params.take,
      orderBy: [{ planNumber: 'asc' }],
      include: {
        plant: true,
        line: true,
        shift: true,
        product: true,
        sku: true,
        supervisor: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
  ]);

  return { total, items };
}

export async function exportPlansExcel(
  params: {
    search?: string;
    plantId?: string;
    lineId?: string;
    shiftId?: string;
    from?: string;
    to?: string;
    status?: string;
  },
  user?: AuthUser,
) {
  const { items } = await listPlans({ ...params, skip: 0, take: 5000 }, user);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Production Management System';
  const sheet = workbook.addWorksheet('Production Plans');

  sheet.columns = [
    { header: 'Work Order', key: 'planNumber', width: 14 },
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Plant', key: 'plant', width: 18 },
    { header: 'Line', key: 'line', width: 12 },
    { header: 'Shift', key: 'shift', width: 12 },
    { header: 'Product', key: 'product', width: 18 },
    { header: 'SKU', key: 'sku', width: 14 },
    { header: 'Batch', key: 'batch', width: 12 },
    { header: 'Planned Cases', key: 'plannedCases', width: 14 },
    { header: 'Operating Mins', key: 'operatingMins', width: 14 },
    { header: 'Manpower', key: 'manpower', width: 10 },
    { header: 'Start Time', key: 'startTime', width: 18 },
    { header: 'End Time', key: 'endTime', width: 18 },
    { header: 'Supervisor', key: 'supervisor', width: 18 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Remarks', key: 'remarks', width: 24 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const p of items) {
    sheet.addRow({
      planNumber: String(p.planNumber || '').replace(/^PP-/i, ''),
      date: toCalendarDate(p.productionDate),
      plant: p.plant.name,
      line: p.line.code || p.line.name,
      shift: p.shift.name,
      product: p.product.name,
      sku: p.sku.packVolume || p.sku.name || p.sku.code,
      batch: p.batchNumber,
      plannedCases: p.plannedCases,
      operatingMins: p.plannedOperatingMins,
      manpower: p.plannedManpower,
      startTime: p.plannedStartTime.toISOString(),
      endTime: p.plannedEndTime.toISOString(),
      supervisor: p.supervisor ? `${p.supervisor.firstName} ${p.supervisor.lastName}` : '',
      status: p.status,
      remarks: p.remarks || '',
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function exportPlanEntriesExcel(planId: string, user?: AuthUser) {
  const plan = await getPlan(planId, user);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Production Management System';

  const summary = workbook.addWorksheet('Plan Summary');
  summary.columns = [
    { header: 'Field', key: 'field', width: 22 },
    { header: 'Value', key: 'value', width: 36 },
  ];
  summary.getRow(1).font = { bold: true };
  const brandName = plan.product?.brand?.name || '';
  const skuLabel = plan.sku?.packVolume || plan.sku?.name || plan.sku?.code || '';
  const rows: Array<[string, string | number]> = [
    ['Work Order', plan.planNumber?.replace(/^PP-/i, '') || plan.planNumber],
    ['Date', toCalendarDate(plan.productionDate)],
    ['Plant', plan.plant?.name || ''],
    ['Line', plan.line?.code || plan.line?.name || ''],
    ['Shift', plan.shift?.name || ''],
    ['Product', plan.product?.name || ''],
    ['SKU', skuLabel],
    ['Brand', brandName],
    ['Batch', plan.batchNumber],
    ['Planned Cases', plan.plannedCases],
    ['Operating Mins', plan.plannedOperatingMins],
    ['Status', plan.status],
  ];
  for (const [field, value] of rows) summary.addRow({ field, value });

  const hourly = workbook.addWorksheet('Hourly Production');
  hourly.columns = [
    { header: 'Brand', key: 'brand', width: 16 },
    { header: 'SKU', key: 'sku', width: 12 },
    { header: 'From', key: 'from', width: 10 },
    { header: 'To', key: 'to', width: 10 },
    { header: 'Target', key: 'planned', width: 10 },
    { header: 'Production', key: 'production', width: 12 },
    { header: 'Loss Cases', key: 'loss', width: 12 },
    { header: 'Downtime Mins', key: 'downtimeMins', width: 14 },
    { header: 'Running Time Mins', key: 'runningMins', width: 16 },
    { header: 'Accepted Cases', key: 'good', width: 14 },
    { header: 'Hold Cases', key: 'reject', width: 12 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Remarks', key: 'remarks', width: 24 },
  ];
  hourly.getRow(1).font = { bold: true };

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const timeOnly = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

  for (const e of plan.productionEntries) {
    const hStart = new Date(e.hourStart);
    let hEnd = new Date(e.hourEnd);
    if (hEnd <= hStart) hEnd = new Date(hEnd.getTime() + 24 * 60 * 60 * 1000);
    const slotMins = Math.max(0, Math.round((hEnd.getTime() - hStart.getTime()) / 60000)) || 60;
    const target = Number(e.plannedCases) || 0;
    const loss = Number(e.lossCases) || Math.max(0, target - Number(e.actualCases || 0));
    let downtimeMins = 0;
    if (target > 0) {
      downtimeMins = Math.min(slotMins, Math.round(((loss / target) * slotMins) * 10) / 10);
    }
    hourly.addRow({
      brand: brandName,
      sku: skuLabel,
      from: timeOnly(new Date(e.hourStart)),
      to: timeOnly(new Date(e.hourEnd)),
      planned: e.plannedCases,
      production: e.actualCases,
      loss: e.lossCases,
      downtimeMins,
      runningMins: Math.round((slotMins - downtimeMins) * 10) / 10,
      good: e.goodCases,
      reject: e.rejectCases,
      status: e.status,
      remarks: e.remarks || '',
    });
  }

  const downtime = workbook.addWorksheet('Downtime');
  downtime.columns = [
    { header: 'Machine', key: 'machine', width: 20 },
    { header: 'Category', key: 'category', width: 22 },
    { header: 'Reason', key: 'reason', width: 24 },
    { header: 'Start', key: 'start', width: 10 },
    { header: 'End', key: 'end', width: 10 },
    { header: 'Mins', key: 'mins', width: 8 },
    { header: 'Action Plan', key: 'actionPlan', width: 28 },
    { header: 'Remarks', key: 'remarks', width: 24 },
  ];
  downtime.getRow(1).font = { bold: true };

  for (const d of plan.downtimeEntries) {
    downtime.addRow({
      machine: d.machine?.code || d.machine?.name || '',
      category: d.category?.name || '',
      reason: d.reason?.name || '',
      start: timeOnly(new Date(d.startTime)),
      end: timeOnly(new Date(d.endTime)),
      mins: d.durationMins,
      actionPlan: d.actionTaken || '',
      remarks: d.remarks || '',
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer: Buffer.from(buffer), planNumber: String(plan.planNumber || '').replace(/^PP-/i, '') };
}

function hourlyLossDowntime(plannedCases: number, actualCases: number, lossCases: number, hourStart: Date, hourEnd: Date) {
  let end = hourEnd;
  if (end <= hourStart) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  const slotMins = Math.max(0, Math.round((end.getTime() - hourStart.getTime()) / 60000)) || 60;
  const target = Number(plannedCases) || 0;
  const loss = Number(lossCases) || Math.max(0, target - Number(actualCases || 0));
  let downtimeMins = 0;
  if (target > 0) {
    downtimeMins = Math.min(slotMins, Math.round(((loss / target) * slotMins) * 10) / 10);
  }
  return {
    slotMins,
    downtimeMins,
    runningMins: Math.round((slotMins - downtimeMins) * 10) / 10,
  };
}

/** Totals by shift (and grand total) for a date range — used by Production Entries "All shifts". */
export async function getShiftProductionTotals(
  params: { from: string; to: string; lineId?: string },
  user?: AuthUser,
) {
  const fromDay = String(params.from || '').slice(0, 10);
  const toDay = String(params.to || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDay) || !/^\d{4}-\d{2}-\d{2}$/.test(toDay)) {
    throw new ValidationError('Valid From/To dates are required (YYYY-MM-DD)');
  }
  if (fromDay > toDay) throw new ValidationError('From date must be on or before To date');

  const rangeStart = new Date(`${fromDay}T00:00:00.000Z`);
  const rangeEnd = new Date(`${toDay}T23:59:59.999Z`);

  const plans = await prisma.productionPlan.findMany({
    where: {
      deletedAt: null,
      ...scopePlans(user),
      productionDate: { gte: rangeStart, lte: rangeEnd },
      ...(params.lineId ? { lineId: params.lineId } : {}),
    },
    include: {
      shift: { select: { id: true, name: true, code: true } },
      line: { select: { id: true, code: true, name: true } },
      productionEntries: {
        where: { deletedAt: null },
        select: { plannedCases: true, actualCases: true, goodCases: true, rejectCases: true, lossCases: true },
      },
      downtimeEntries: {
        where: { deletedAt: null },
        select: { durationMins: true },
      },
    },
    orderBy: [{ shift: { name: 'asc' } }, { planNumber: 'asc' }],
  });

  type Acc = {
    shiftId: string;
    shiftName: string;
    shiftCode: string;
    planCount: number;
    plannedCases: number;
    actualCases: number;
    goodCases: number;
    rejectCases: number;
    lossCases: number;
    downtimeMins: number;
  };

  const byShift = new Map<string, Acc>();

  for (const plan of plans) {
    const sid = plan.shiftId || plan.shift?.id || 'unknown';
    let row = byShift.get(sid);
    if (!row) {
      row = {
        shiftId: sid,
        shiftName: plan.shift?.name || 'Unknown',
        shiftCode: plan.shift?.code || '',
        planCount: 0,
        plannedCases: 0,
        actualCases: 0,
        goodCases: 0,
        rejectCases: 0,
        lossCases: 0,
        downtimeMins: 0,
      };
      byShift.set(sid, row);
    }
    row.planCount += 1;
    row.plannedCases += plan.plannedCases || 0;
    for (const e of plan.productionEntries) {
      row.actualCases += e.actualCases || 0;
      row.goodCases += e.goodCases || 0;
      row.rejectCases += e.rejectCases || 0;
      row.lossCases += e.lossCases || 0;
    }
    for (const d of plan.downtimeEntries) {
      row.downtimeMins += d.durationMins || 0;
    }
  }

  const shifts = [...byShift.values()].sort((a, b) => a.shiftName.localeCompare(b.shiftName));
  const totals = shifts.reduce(
    (s, r) => ({
      planCount: s.planCount + r.planCount,
      plannedCases: s.plannedCases + r.plannedCases,
      actualCases: s.actualCases + r.actualCases,
      goodCases: s.goodCases + r.goodCases,
      rejectCases: s.rejectCases + r.rejectCases,
      lossCases: s.lossCases + r.lossCases,
      downtimeMins: s.downtimeMins + r.downtimeMins,
    }),
    {
      planCount: 0,
      plannedCases: 0,
      actualCases: 0,
      goodCases: 0,
      rejectCases: 0,
      lossCases: 0,
      downtimeMins: 0,
    },
  );

  return { from: fromDay, to: toDay, shifts, totals };
}

export async function exportProductionEntriesReportExcel(
  params: {
    mode: 'day' | 'shift';
    date?: string;
    from?: string;
    to?: string;
    shiftId?: string;
    lineId?: string;
  },
  user?: AuthUser,
) {
  const fromDay = String(params.from || params.date || '').slice(0, 10);
  const toDay = String(params.to || params.from || params.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDay) || !/^\d{4}-\d{2}-\d{2}$/.test(toDay)) {
    throw new ValidationError('Valid From/To dates are required (YYYY-MM-DD)');
  }
  if (fromDay > toDay) throw new ValidationError('From date must be on or before To date');
  if (params.mode === 'shift' && !params.shiftId) throw new ValidationError('Shift is required for shift-wise report');

  const rangeStart = new Date(`${fromDay}T00:00:00.000Z`);
  const rangeEnd = new Date(`${toDay}T23:59:59.999Z`);

  const plans = await prisma.productionPlan.findMany({
    where: {
      deletedAt: null,
      ...scopePlans(user),
      productionDate: { gte: rangeStart, lte: rangeEnd },
      ...(params.shiftId ? { shiftId: params.shiftId } : {}),
      ...(params.lineId ? { lineId: params.lineId } : {}),
    },
    include: planInclude,
    orderBy: [{ productionDate: 'asc' }, { line: { code: 'asc' } }, { shift: { name: 'asc' } }, { planNumber: 'asc' }],
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Nakshatra Beverages';
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const timeOnly = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

  const summary = workbook.addWorksheet(params.mode === 'shift' ? 'Shift Summary' : 'Day Summary');
  summary.columns = [
    { header: 'Field', key: 'field', width: 24 },
    { header: 'Value', key: 'value', width: 40 },
  ];
  summary.getRow(1).font = { bold: true };
  summary.addRow({ field: 'Report Type', value: params.mode === 'shift' ? 'Shift-wise' : 'Day-wise' });
  summary.addRow({ field: 'From Date', value: fromDay });
  summary.addRow({ field: 'To Date', value: toDay });
  if (params.mode === 'shift') {
    const shiftName = plans[0]?.shift?.name || params.shiftId || '';
    summary.addRow({ field: 'Shift', value: shiftName });
  }
  summary.addRow({ field: 'Plans Included', value: plans.length });
  const totalPlanned = plans.reduce((s, p) => s + p.plannedCases, 0);
  const totalActual = plans.reduce(
    (s, p) => s + p.productionEntries.reduce((x, e) => x + e.actualCases, 0),
    0,
  );
  const totalAccepted = plans.reduce(
    (s, p) => s + p.productionEntries.reduce((x, e) => x + e.goodCases, 0),
    0,
  );
  const totalHold = plans.reduce(
    (s, p) => s + p.productionEntries.reduce((x, e) => x + e.rejectCases, 0),
    0,
  );
  const totalDtLog = plans.reduce(
    (s, p) => s + p.downtimeEntries.reduce((x, e) => x + e.durationMins, 0),
    0,
  );
  summary.addRow({ field: 'Total Planned Cases', value: totalPlanned });
  summary.addRow({ field: 'Total Production Cases', value: totalActual });
  summary.addRow({ field: 'Total Accepted Cases', value: totalAccepted });
  summary.addRow({ field: 'Total Hold Cases', value: totalHold });
  summary.addRow({ field: 'Logged Downtime Mins', value: totalDtLog });

  const hourly = workbook.addWorksheet('Hourly Production');
  hourly.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Shift', key: 'shift', width: 12 },
    { header: 'Line', key: 'line', width: 12 },
    { header: 'Work Order', key: 'planNumber', width: 14 },
    { header: 'Brand', key: 'brand', width: 16 },
    { header: 'SKU', key: 'sku', width: 12 },
    { header: 'From', key: 'from', width: 10 },
    { header: 'To', key: 'to', width: 10 },
    { header: 'Target', key: 'planned', width: 10 },
    { header: 'Production', key: 'production', width: 12 },
    { header: 'Accepted', key: 'good', width: 12 },
    { header: 'Hold', key: 'reject', width: 10 },
    { header: 'Loss Cases', key: 'loss', width: 12 },
    { header: 'Downtime Mins', key: 'downtimeMins', width: 14 },
    { header: 'Running Time Mins', key: 'runningMins', width: 16 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Remarks', key: 'remarks', width: 24 },
  ];
  hourly.getRow(1).font = { bold: true };

  const downtimeSheet = workbook.addWorksheet('Downtime');
  downtimeSheet.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Shift', key: 'shift', width: 12 },
    { header: 'Line', key: 'line', width: 12 },
    { header: 'Work Order', key: 'planNumber', width: 14 },
    { header: 'Machine', key: 'machine', width: 20 },
    { header: 'Category', key: 'category', width: 22 },
    { header: 'Reason', key: 'reason', width: 24 },
    { header: 'Start', key: 'start', width: 10 },
    { header: 'End', key: 'end', width: 10 },
    { header: 'Mins', key: 'mins', width: 8 },
    { header: 'Action Plan', key: 'actionPlan', width: 28 },
    { header: 'Remarks', key: 'remarks', width: 24 },
  ];
  downtimeSheet.getRow(1).font = { bold: true };

  for (const plan of plans) {
    const brandName = plan.product?.brand?.name || '';
    const skuLabel = plan.sku?.packVolume || plan.sku?.name || plan.sku?.code || '';
    const dateStr = toCalendarDate(plan.productionDate);
    const lineLabel = plan.line?.code || plan.line?.name || '';
    const shiftLabel = plan.shift?.name || '';

    for (const e of plan.productionEntries) {
      const metrics = hourlyLossDowntime(
        e.plannedCases,
        e.actualCases,
        e.lossCases,
        new Date(e.hourStart),
        new Date(e.hourEnd),
      );
      hourly.addRow({
        date: dateStr,
        shift: shiftLabel,
        line: lineLabel,
        planNumber: String(plan.planNumber || '').replace(/^PP-/i, ''),
        brand: brandName,
        sku: skuLabel,
        from: timeOnly(new Date(e.hourStart)),
        to: timeOnly(new Date(e.hourEnd)),
        planned: e.plannedCases,
        production: e.actualCases,
        good: e.goodCases,
        reject: e.rejectCases,
        loss: e.lossCases,
        downtimeMins: metrics.downtimeMins,
        runningMins: metrics.runningMins,
        status: e.status,
        remarks: e.remarks || '',
      });
    }

    for (const d of plan.downtimeEntries) {
      downtimeSheet.addRow({
        date: dateStr,
        shift: shiftLabel,
        line: lineLabel,
        planNumber: String(plan.planNumber || '').replace(/^PP-/i, ''),
        machine: d.machine?.code || d.machine?.name || '',
        category: d.category?.name || '',
        reason: d.reason?.name || '',
        start: timeOnly(new Date(d.startTime)),
        end: timeOnly(new Date(d.endTime)),
        mins: d.durationMins,
        actionPlan: d.actionTaken || '',
        remarks: d.remarks || '',
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const shiftPart = params.mode === 'shift' ? `-shift` : '-day';
  const fileRange = fromDay === toDay ? fromDay : `${fromDay}_to_${toDay}`;
  return {
    buffer: Buffer.from(buffer),
    filename: `production-entries${shiftPart}-${fileRange}.xlsx`,
  };
}

export async function getPlan(id: string, user?: AuthUser) {
  const plan = await prisma.productionPlan.findFirst({
    where: { id, deletedAt: null, ...scopePlans(user) },
    include: planInclude,
  });
  if (!plan) throw new NotFoundError('Production plan not found');
  return plan;
}

async function nextPlanNumber() {
  const count = await prisma.productionPlan.count();
  return String(count + 1).padStart(6, '0');
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function fmtHm(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Normalize plan window; if end ≤ start, treat as overnight (end next day). */
function resolvePlanWindow(startInput: string | Date, endInput: string | Date) {
  const startAt = new Date(startInput);
  let endAt = new Date(endInput);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    throw new ValidationError('Invalid production start or end time');
  }
  if (endAt.getTime() <= startAt.getTime()) {
    endAt = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);
  }
  return { startAt, endAt };
}

function windowOverlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

async function findOverlappingPlans(opts: {
  lineId: string;
  productionDate: string | Date;
  startAt: Date;
  endAt: Date;
  excludePlanId?: string;
}) {
  const day = toCalendarDate(opts.productionDate);
  const rangeStart = new Date(`${day}T00:00:00.000Z`);
  const rangeEnd = new Date(`${day}T23:59:59.999Z`);

  const candidates = await prisma.productionPlan.findMany({
    where: {
      deletedAt: null,
      lineId: opts.lineId,
      productionDate: { gte: rangeStart, lte: rangeEnd },
      ...(opts.excludePlanId ? { id: { not: opts.excludePlanId } } : {}),
    },
    select: {
      id: true,
      planNumber: true,
      plannedStartTime: true,
      plannedEndTime: true,
      shift: { select: { name: true } },
    },
  });

  const overlaps: Array<{
    planNumber: string;
    shiftName: string;
    start: Date;
    end: Date;
  }> = [];

  for (const other of candidates) {
    const oStart = new Date(other.plannedStartTime);
    let oEnd = new Date(other.plannedEndTime);
    if (Number.isNaN(oStart.getTime()) || Number.isNaN(oEnd.getTime())) continue;
    if (oEnd.getTime() <= oStart.getTime()) {
      oEnd = new Date(oEnd.getTime() + 24 * 60 * 60 * 1000);
    }
    if (windowOverlaps(opts.startAt, opts.endAt, oStart, oEnd)) {
      overlaps.push({
        planNumber: other.planNumber,
        shiftName: other.shift?.name || '—',
        start: oStart,
        end: oEnd,
      });
    }
  }

  return overlaps;
}

async function assertNoPlanTimeOverlap(
  opts: {
    lineId: string;
    productionDate: string | Date;
    startAt: Date;
    endAt: Date;
    excludePlanId?: string;
  },
  allowOverlap?: boolean,
) {
  if (allowOverlap) return;
  const overlaps = await findOverlappingPlans(opts);
  if (overlaps.length === 0) return;
  const first = overlaps[0];
  throw new ValidationError(
    `Production time overlaps with work order ${first.planNumber} (${fmtHm(first.start)}–${fmtHm(first.end)}). Adjust times or allow overlap.`,
  );
}

export async function createPlan(
  data: {
    productionDate: string | Date;
    plantId: string;
    lineId: string;
    shiftId: string;
    productId: string;
    skuId: string;
    batchNumber: string;
    plannedCases: number;
    plannedOperatingMins: number;
    plannedStartTime: string | Date;
    plannedEndTime: string | Date;
    plannedManpower: number;
    supervisorId?: string | null;
    status?: Prisma.EnumPlanStatusFieldUpdateOperationsInput['set'];
    remarks?: string | null;
    allowOverlap?: boolean;
  },
  req?: Request,
) {
  const { allowOverlap, ...planData } = data;
  const { startAt, endAt } = resolvePlanWindow(planData.plannedStartTime, planData.plannedEndTime);
  await assertNoPlanTimeOverlap(
    {
      lineId: planData.lineId,
      productionDate: planData.productionDate,
      startAt,
      endAt,
    },
    allowOverlap,
  );

  const plan = await prisma.productionPlan.create({
    data: {
      planNumber: await nextPlanNumber(),
      productionDate: parseCalendarDate(planData.productionDate),
      plantId: planData.plantId,
      lineId: planData.lineId,
      shiftId: planData.shiftId,
      productId: planData.productId,
      skuId: planData.skuId,
      batchNumber: planData.batchNumber,
      plannedCases: planData.plannedCases,
      plannedOperatingMins: planData.plannedOperatingMins,
      plannedStartTime: startAt,
      plannedEndTime: endAt,
      plannedManpower: planData.plannedManpower,
      supervisorId: planData.supervisorId,
      status: (planData.status as never) ?? 'SCHEDULED',
      remarks: planData.remarks,
      createdById: req?.user?.id,
    },
    include: planInclude,
  });
  await writeAuditLog({ req, action: 'CREATE', entity: 'ProductionPlan', entityId: plan.id, after: plan });
  return plan;
}

export async function updatePlan(id: string, data: Record<string, unknown>, req?: Request) {
  const before = await getPlan(id, req?.user);
  const allowOverlap = data.allowOverlap === true;
  const { allowOverlap: _drop, ...patch } = data;

  const lineId = (typeof patch.lineId === 'string' ? patch.lineId : undefined) ?? before.lineId;
  const productionDate =
    (typeof patch.productionDate === 'string' || patch.productionDate instanceof Date
      ? patch.productionDate
      : undefined) ?? before.productionDate;
  const startInput =
    (typeof patch.plannedStartTime === 'string' || patch.plannedStartTime instanceof Date
      ? patch.plannedStartTime
      : undefined) ?? before.plannedStartTime;
  const endInput =
    (typeof patch.plannedEndTime === 'string' || patch.plannedEndTime instanceof Date
      ? patch.plannedEndTime
      : undefined) ?? before.plannedEndTime;
  const { startAt, endAt } = resolvePlanWindow(startInput, endInput);

  await assertNoPlanTimeOverlap(
    {
      lineId,
      productionDate,
      startAt,
      endAt,
      excludePlanId: id,
    },
    allowOverlap,
  );

  const plan = await prisma.productionPlan.update({
    where: { id },
    data: {
      ...patch,
      productionDate: patch.productionDate
        ? parseCalendarDate(patch.productionDate as string)
        : undefined,
      plannedStartTime: patch.plannedStartTime ? startAt : undefined,
      plannedEndTime: patch.plannedEndTime ? endAt : undefined,
      updatedById: req?.user?.id,
    },
    include: planInclude,
  });
  await writeAuditLog({
    req,
    action: 'UPDATE',
    entity: 'ProductionPlan',
    entityId: id,
    before,
    after: plan,
  });
  return plan;
}

export async function deletePlan(id: string, req?: Request) {
  const before = await getPlan(id, req?.user);
  await prisma.productionPlan.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'CANCELLED', updatedById: req?.user?.id },
  });
  await writeAuditLog({ req, action: 'DELETE', entity: 'ProductionPlan', entityId: id, before });
  return { message: 'Plan deleted' };
}

export async function createProductionEntry(
  data: {
    planId: string;
    hourStart: string | Date;
    hourEnd: string | Date;
    plannedCases: number;
    actualCases: number;
    goodCases: number;
    rejectCases: number;
    remarks?: string | null;
    status?: EntryStatus;
    reworkByZone?: ReworkByZoneInput[];
  },
  req?: Request,
) {
  await getPlan(data.planId, req?.user);
  if (data.goodCases + data.rejectCases > data.actualCases + 0.0001) {
    throw new ValidationError('Accepted + Hold cases cannot exceed Production cases');
  }
  const reworkRows = normalizeReworkByZone(data.reworkByZone);
  const reworkTotal = sumReworkCases(reworkRows);
  if (data.rejectCases + reworkTotal > data.actualCases + 0.0001) {
    throw new ValidationError('Hold + zone rework cases cannot exceed Production cases');
  }

  const entry = await prisma.$transaction(async (tx) => {
    const created = await tx.productionEntry.create({
      data: {
        planId: data.planId,
        hourStart: new Date(data.hourStart),
        hourEnd: new Date(data.hourEnd),
        plannedCases: data.plannedCases,
        actualCases: data.actualCases,
        goodCases: data.goodCases,
        rejectCases: data.rejectCases,
        lossCases: calcLoss(data.plannedCases, data.actualCases),
        remarks: data.remarks,
        status: data.status ?? 'SUBMITTED',
        createdById: req!.user!.id,
      },
    });
    if (reworkRows.length > 0) {
      await tx.reworkEntry.createMany({
        data: reworkRows.map((r) => ({
          productionEntryId: created.id,
          zone: r.zone,
          reworkCases: r.reworkCases,
        })),
      });
    }
    return tx.productionEntry.findFirstOrThrow({
      where: { id: created.id },
      include: { reworkEntries: { where: { deletedAt: null } } },
    });
  });

  // Notify managers if target missed
  if (data.actualCases < data.plannedCases * 0.9) {
    const managers = await prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        role: { in: ['ADMIN', 'PRODUCTION_MANAGER'] },
      },
      select: { id: true },
    });
    await prisma.notification.createMany({
      data: managers.map((m) => ({
        userId: m.id,
        type: 'TARGET_MISSED' as const,
        title: 'Production target missed',
        message: `Hourly entry for plan fell below 90% of planned cases (${data.actualCases}/${data.plannedCases}).`,
        meta: { planId: data.planId, entryId: entry.id },
      })),
    });
  }

  await writeAuditLog({
    req,
    action: 'CREATE',
    entity: 'ProductionEntry',
    entityId: entry.id,
    after: entry,
  });
  return entry;
}

async function syncReworkEntries(
  tx: Prisma.TransactionClient,
  productionEntryId: string,
  reworkByZone: ReworkByZoneInput[] | undefined,
) {
  if (reworkByZone === undefined) return;
  const rows = normalizeReworkByZone(reworkByZone);
  const wanted = new Map(rows.map((r) => [r.zone, r.reworkCases]));
  const existing = await tx.reworkEntry.findMany({
    where: { productionEntryId, deletedAt: null },
  });
  const now = new Date();

  for (const row of existing) {
    const next = wanted.get(row.zone as ReworkZone);
    if (next == null || next <= 0) {
      await tx.reworkEntry.update({
        where: { id: row.id },
        data: { deletedAt: now, reworkCases: 0 },
      });
    } else {
      await tx.reworkEntry.update({
        where: { id: row.id },
        data: { reworkCases: next },
      });
      wanted.delete(row.zone as ReworkZone);
    }
  }

  for (const [zone, reworkCases] of wanted) {
    const softDeleted = await tx.reworkEntry.findFirst({
      where: { productionEntryId, zone, deletedAt: { not: null } },
    });
    if (softDeleted) {
      await tx.reworkEntry.update({
        where: { id: softDeleted.id },
        data: { deletedAt: null, reworkCases },
      });
    } else {
      await tx.reworkEntry.create({
        data: { productionEntryId, zone, reworkCases },
      });
    }
  }
}

export async function updateProductionEntry(id: string, data: Record<string, unknown>, req?: Request) {
  const before = await prisma.productionEntry.findFirst({
    where: { id, deletedAt: null },
    include: { reworkEntries: { where: { deletedAt: null } } },
  });
  if (!before) throw new NotFoundError('Entry not found');
  await getPlan(before.planId, req?.user);

  if (before.status === 'APPROVED' && req?.user?.role === 'LINE_SUPERVISOR') {
    throw new ForbiddenError('Approved entries cannot be edited by supervisors');
  }

  const plannedCases = (data.plannedCases as number) ?? before.plannedCases;
  const actualCases = (data.actualCases as number) ?? before.actualCases;
  const goodCases = (data.goodCases as number) ?? before.goodCases;
  const rejectCases = (data.rejectCases as number) ?? before.rejectCases;
  const reworkByZone = data.reworkByZone as ReworkByZoneInput[] | undefined;
  const reworkTotal =
    reworkByZone !== undefined
      ? sumReworkCases(reworkByZone)
      : before.reworkEntries.reduce((s, r) => s + r.reworkCases, 0);

  if (goodCases + rejectCases > actualCases + 0.0001) {
    throw new ValidationError('Accepted + Hold cases cannot exceed Production cases');
  }
  if (rejectCases + reworkTotal > actualCases + 0.0001) {
    throw new ValidationError('Hold + zone rework cases cannot exceed Production cases');
  }

  const { planId: _planId, reworkByZone: _rw, ...rest } = data;

  const entry = await prisma.$transaction(async (tx) => {
    await tx.productionEntry.update({
      where: { id },
      data: {
        ...rest,
        hourStart: data.hourStart ? new Date(data.hourStart as string) : undefined,
        hourEnd: data.hourEnd ? new Date(data.hourEnd as string) : undefined,
        lossCases: calcLoss(plannedCases, actualCases),
      },
    });
    await syncReworkEntries(tx, id, reworkByZone);
    return tx.productionEntry.findFirstOrThrow({
      where: { id },
      include: { reworkEntries: { where: { deletedAt: null } } },
    });
  });

  await writeAuditLog({
    req,
    action: 'UPDATE',
    entity: 'ProductionEntry',
    entityId: id,
    before,
    after: entry,
  });
  return entry;
}

export async function deleteProductionEntry(id: string, req?: Request) {
  const before = await prisma.productionEntry.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw new NotFoundError('Entry not found');
  await getPlan(before.planId, req?.user);

  if (before.status === 'APPROVED' && req?.user?.role === 'LINE_SUPERVISOR') {
    throw new ForbiddenError('Approved entries cannot be deleted by supervisors');
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.reworkEntry.updateMany({
      where: { productionEntryId: id, deletedAt: null },
      data: { deletedAt: now },
    }),
    prisma.productionEntry.update({
      where: { id },
      data: { deletedAt: now },
    }),
  ]);
  await writeAuditLog({ req, action: 'DELETE', entity: 'ProductionEntry', entityId: id, before });
  return { message: 'Entry deleted' };
}

export async function approveEntry(
  id: string,
  status: 'APPROVED' | 'REJECTED',
  approvalRemarks: string | null | undefined,
  req?: Request,
) {
  const before = await prisma.productionEntry.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw new NotFoundError('Entry not found');

  const entry = await prisma.productionEntry.update({
    where: { id },
    data: {
      status,
      approvalRemarks,
      approvedById: req!.user!.id,
      approvedAt: new Date(),
    },
  });

  await prisma.notification.create({
    data: {
      userId: before.createdById,
      type: 'PENDING_APPROVAL',
      title: `Production entry ${status.toLowerCase()}`,
      message: `Your production entry was ${status.toLowerCase()}.`,
      meta: { entryId: id },
    },
  });

  await writeAuditLog({
    req,
    action: status,
    entity: 'ProductionEntry',
    entityId: id,
    before,
    after: entry,
  });
  return entry;
}

async function ensureDefaultDowntimeCategory() {
  let category = await prisma.downtimeCategory.findFirst({
    where: { code: 'GEN' },
  });
  if (!category) {
    category = await prisma.downtimeCategory.create({
      data: {
        code: 'GEN',
        name: 'General',
        description: 'System fallback — hidden from category list',
        isActive: false,
      },
    });
  } else if (category.isActive || category.deletedAt) {
    category = await prisma.downtimeCategory.update({
      where: { id: category.id },
      data: { isActive: false, deletedAt: null },
    });
  }
  return category;
}

async function resolveDowntimeReason(
  categoryIdInput?: string | null,
  reasonIdInput?: string | null,
  reasonTextInput?: string | null,
) {
  const reasonId = String(reasonIdInput || '').trim();
  const reasonText = String(reasonTextInput || '').trim();

  let reason = reasonId
    ? await prisma.downtimeReason.findFirst({ where: { id: reasonId, deletedAt: null } })
    : null;

  if (!reason && reasonText) {
    reason = await prisma.downtimeReason.findFirst({
      where: {
        deletedAt: null,
        name: { equals: reasonText, mode: 'insensitive' },
      },
    });
  }

  let categoryId = String(categoryIdInput || reason?.categoryId || '').trim();
  let category = categoryId
    ? await prisma.downtimeCategory.findFirst({ where: { id: categoryId, deletedAt: null } })
    : null;

  if (!category) {
    category = await ensureDefaultDowntimeCategory();
    categoryId = category.id;
  }

  if (reason && reason.categoryId !== categoryId && !categoryIdInput) {
    // Keep the category that owns the matched reason when user did not pick one
    categoryId = reason.categoryId;
    category = await prisma.downtimeCategory.findFirst({ where: { id: categoryId, deletedAt: null } });
    if (!category) throw new ValidationError('Selected downtime category is invalid');
  }

  if (reason && reason.categoryId !== categoryId && categoryIdInput) {
    throw new ValidationError('Reason does not belong to the selected category.');
  }

  if (!reason && reasonText) {
    const slug =
      reasonText
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'CUSTOM';
    const code = `DT-${category.code}-${slug}-${Date.now().toString(36)}`.slice(0, 80);
    reason = await prisma.downtimeReason.create({
      data: {
        code,
        name: reasonText,
        categoryId,
        description: 'Entered from Production Entries',
      },
    });
  }

  if (!reason) throw new ValidationError('Reason is required');
  return { category: category!, reason };
}

function parseDowntimeWindow(startTime: string | Date, endTime: string | Date) {
  let start = new Date(startTime);
  let end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new ValidationError('Invalid downtime start/end time');
  }
  if (end <= start) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }
  const durationMins = minutesBetween(start, end);
  if (durationMins <= 0) throw new ValidationError('Downtime duration must be greater than 0 minutes');
  return { start, end, durationMins };
}

export async function createDowntime(
  data: {
    planId: string;
    machineId?: string | null;
    categoryId?: string | null;
    reasonId?: string | null;
    reason?: string | null;
    startTime: string | Date;
    endTime: string | Date;
    actionTaken?: string | null;
    remarks?: string | null;
  },
  req?: Request,
) {
  await getPlan(data.planId, req?.user);

  const { category, reason } = await resolveDowntimeReason(data.categoryId, data.reasonId, data.reason);
  const categoryId = category.id;
  const reasonId = reason.id;

  const machineId = data.machineId && String(data.machineId).trim() ? String(data.machineId).trim() : null;
  if (machineId) {
    const machine = await prisma.machine.findFirst({ where: { id: machineId, deletedAt: null } });
    if (!machine) throw new ValidationError('Selected machine is invalid');
  }

  const { start, end, durationMins } = parseDowntimeWindow(data.startTime, data.endTime);

  const entry = await prisma.downtimeEntry.create({
    data: {
      planId: data.planId,
      machineId,
      categoryId,
      reasonId,
      startTime: start,
      endTime: end,
      durationMins,
      actionTaken: data.actionTaken,
      remarks: data.remarks,
      createdById: req!.user!.id,
    },
    include: { machine: true, category: true, reason: true },
  });

  if (durationMins >= 30) {
    const managers = await prisma.user.findMany({
      where: { deletedAt: null, isActive: true, role: { in: ['ADMIN', 'PRODUCTION_MANAGER'] } },
      select: { id: true },
    });
    const type = entry.category?.name?.toLowerCase().includes('breakdown')
      ? ('MACHINE_BREAKDOWN' as const)
      : ('HIGH_DOWNTIME' as const);
    await prisma.notification.createMany({
      data: managers.map((m) => ({
        userId: m.id,
        type,
        title: type === 'MACHINE_BREAKDOWN' ? 'Machine breakdown' : 'High downtime',
        message: `Downtime of ${durationMins.toFixed(0)} mins recorded on plan.`,
        meta: { planId: data.planId, downtimeId: entry.id },
      })),
    });
  }

  await writeAuditLog({ req, action: 'CREATE', entity: 'DowntimeEntry', entityId: entry.id, after: entry });
  return entry;
}

export async function updateDowntime(
  id: string,
  data: {
    machineId?: string | null;
    categoryId?: string;
    reasonId?: string | null;
    reason?: string | null;
    startTime?: string | Date;
    endTime?: string | Date;
    actionTaken?: string | null;
    remarks?: string | null;
  },
  req?: Request,
) {
  const before = await prisma.downtimeEntry.findFirst({
    where: { id, deletedAt: null },
    include: { category: true, reason: true, machine: true },
  });
  if (!before) throw new NotFoundError('Downtime entry not found');
  await getPlan(before.planId, req?.user);

  const hasReasonUpdate =
    (data.reasonId != null && String(data.reasonId).trim() !== '') ||
    (data.reason != null && String(data.reason).trim() !== '');

  const { category, reason } = hasReasonUpdate
    ? await resolveDowntimeReason(data.categoryId, data.reasonId, data.reason)
    : await resolveDowntimeReason(
        data.categoryId ?? before.categoryId,
        before.reasonId,
        null,
      );
  const categoryId = category.id;

  let machineId: string | null = before.machineId;
  if (data.machineId !== undefined) {
    machineId = data.machineId && String(data.machineId).trim() ? String(data.machineId).trim() : null;
  }
  if (machineId) {
    const machine = await prisma.machine.findFirst({ where: { id: machineId, deletedAt: null } });
    if (!machine) throw new ValidationError('Selected machine is invalid');
  }

  const startTime = data.startTime ?? before.startTime;
  const endTime = data.endTime ?? before.endTime;
  const { start, end, durationMins } = parseDowntimeWindow(startTime, endTime);

  const entry = await prisma.downtimeEntry.update({
    where: { id },
    data: {
      machineId,
      categoryId,
      reasonId: reason.id,
      startTime: start,
      endTime: end,
      durationMins,
      actionTaken: data.actionTaken !== undefined ? data.actionTaken : before.actionTaken,
      remarks: data.remarks !== undefined ? data.remarks : before.remarks,
    },
    include: { machine: true, category: true, reason: true },
  });

  await writeAuditLog({
    req,
    action: 'UPDATE',
    entity: 'DowntimeEntry',
    entityId: id,
    before,
    after: entry,
  });
  return entry;
}

export async function deleteDowntime(id: string, req?: Request) {
  const before = await prisma.downtimeEntry.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw new NotFoundError('Downtime entry not found');
  await getPlan(before.planId, req?.user);

  await prisma.downtimeEntry.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await writeAuditLog({ req, action: 'DELETE', entity: 'DowntimeEntry', entityId: id, before });
  return { message: 'Downtime entry deleted' };
}

const changeoverInclude = {
  line: { select: { id: true, code: true, name: true } },
  plan: { select: { id: true, planNumber: true } },
  changeoverType: { select: { id: true, name: true, standardMins: true } },
  fromProduct: { select: { id: true, name: true } },
  toProduct: { select: { id: true, name: true } },
  fromSku: { select: { id: true, code: true, name: true, packVolume: true } },
  toSku: { select: { id: true, code: true, name: true, packVolume: true } },
} satisfies Prisma.ChangeoverEntryInclude;

function changeoverListWhere(
  params: {
    from?: string;
    to?: string;
    lineId?: string;
    changeoverTypeId?: string;
    kind?: string;
  },
  user?: AuthUser,
): Prisma.ChangeoverEntryWhereInput {
  const parts: Prisma.ChangeoverEntryWhereInput[] = [];

  if (user?.role === 'LINE_SUPERVISOR') {
    parts.push({
      OR: [
        { line: { supervisorId: user.id } },
        { plan: { supervisorId: user.id } },
        { plan: { line: { supervisorId: user.id } } },
      ],
    });
  } else if (user?.role === 'PRODUCTION_MANAGER' && user.plantId) {
    parts.push({
      OR: [{ line: { plantId: user.plantId } }, { plan: { plantId: user.plantId } }],
    });
  }

  if (params.from || params.to) {
    const { start, end } = calendarDateRange(params.from, params.to, 365);
    parts.push({
      OR: [
        { productionDate: { gte: start, lte: end } },
        { productionDate: null, startTime: { gte: start, lte: end } },
        { productionDate: null, startTime: null, createdAt: { gte: start, lte: end } },
      ],
    });
  }

  if (params.lineId) parts.push({ lineId: params.lineId });
  if (params.changeoverTypeId) parts.push({ changeoverTypeId: params.changeoverTypeId });
  if (params.kind === 'PLANNED' || params.kind === 'UNPLANNED') {
    parts.push({ kind: params.kind });
  }

  if (parts.length === 0) return { deletedAt: null };
  return { deletedAt: null, AND: parts };
}

export async function listChangeovers(
  params: {
    from?: string;
    to?: string;
    lineId?: string;
    changeoverTypeId?: string;
    kind?: string;
  } = {},
  user?: AuthUser,
) {
  return prisma.changeoverEntry.findMany({
    where: changeoverListWhere(params, user),
    include: changeoverInclude,
    orderBy: [{ productionDate: 'desc' }, { startTime: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function exportChangeoversExcel(
  params: {
    from?: string;
    to?: string;
    lineId?: string;
    changeoverTypeId?: string;
    kind?: string;
  } = {},
  user?: AuthUser,
) {
  const items = await listChangeovers(params, user);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Production Management System';
  const sheet = workbook.addWorksheet('Changeover Details');

  sheet.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Line', key: 'line', width: 14 },
    { header: 'From Product', key: 'fromProduct', width: 18 },
    { header: 'From SKU', key: 'fromSku', width: 14 },
    { header: 'To Product', key: 'toProduct', width: 18 },
    { header: 'To SKU', key: 'toSku', width: 14 },
    { header: 'Changeover Type', key: 'type', width: 18 },
    { header: 'Plan Type', key: 'kind', width: 12 },
    { header: 'Start', key: 'start', width: 10 },
    { header: 'End', key: 'end', width: 10 },
    { header: 'Standard Mins', key: 'standardMins', width: 14 },
    { header: 'Total Mins', key: 'actualMins', width: 12 },
    { header: 'Reason', key: 'reason', width: 24 },
    { header: 'Remarks', key: 'remarks', width: 24 },
  ];
  sheet.getRow(1).font = { bold: true };

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const timeOnly = (d: Date | null) => (d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '');

  for (const c of items) {
    sheet.addRow({
      date: c.productionDate
        ? c.productionDate.toISOString().slice(0, 10)
        : c.startTime
          ? c.startTime.toISOString().slice(0, 10)
          : '',
      line: c.line?.code || c.line?.name || '',
      fromProduct: c.fromProduct?.name || '',
      fromSku: c.fromSku?.packVolume || c.fromSku?.name || c.fromSku?.code || '',
      toProduct: c.toProduct?.name || '',
      toSku: c.toSku?.packVolume || c.toSku?.name || c.toSku?.code || '',
      type: c.changeoverType?.name || '',
      kind: c.kind === 'UNPLANNED' ? 'Unplanned' : 'Planned',
      start: timeOnly(c.startTime),
      end: timeOnly(c.endTime),
      standardMins: c.standardMins,
      actualMins: c.actualMins,
      reason: c.reason || '',
      remarks: c.remarks || '',
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function createChangeover(
  data: {
    planId?: string | null;
    lineId?: string | null;
    productionDate?: string | Date | null;
    changeoverTypeId: string;
    fromProductId: string;
    toProductId: string;
    fromSkuId?: string | null;
    toSkuId?: string | null;
    kind?: 'PLANNED' | 'UNPLANNED';
    status?: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
    standardMins: number;
    actualMins?: number;
    reason?: string | null;
    remarks?: string | null;
    startTime?: string | Date | null;
    endTime?: string | Date | null;
  },
  req?: Request,
) {
  let planId = data.planId && String(data.planId).trim() ? String(data.planId).trim() : null;
  let lineId = data.lineId && String(data.lineId).trim() ? String(data.lineId).trim() : null;
  let productionDate: Date | null = data.productionDate ? parseCalendarDate(data.productionDate) : null;

  if (planId) {
    const plan = await getPlan(planId, req?.user);
    lineId = lineId || plan.lineId;
    productionDate = productionDate || plan.productionDate;
  } else {
    if (!lineId) throw new ValidationError('Production line is required');
    if (!productionDate || Number.isNaN(productionDate.getTime())) {
      throw new ValidationError('Date is required');
    }
    if (!data.fromSkuId) throw new ValidationError('From SKU is required');
    if (!data.toSkuId) throw new ValidationError('To SKU is required');
    const line = await prisma.productionLine.findFirst({ where: { id: lineId, deletedAt: null } });
    if (!line) throw new ValidationError('Selected production line is invalid');
  }

  let start = data.startTime ? new Date(data.startTime) : null;
  let end = data.endTime ? new Date(data.endTime) : null;
  if (start && Number.isNaN(start.getTime())) throw new ValidationError('Invalid changeover start time');
  if (end && Number.isNaN(end.getTime())) throw new ValidationError('Invalid changeover end time');
  if (start && end && end <= start) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }

  let actualMins = data.actualMins;
  if ((actualMins == null || Number.isNaN(actualMins)) && start && end) {
    actualMins = minutesBetween(start, end);
  }
  if (actualMins == null || Number.isNaN(actualMins) || actualMins < 0) {
    throw new ValidationError('Total changeover time is required');
  }

  const entry = await prisma.changeoverEntry.create({
    data: {
      planId,
      lineId,
      productionDate,
      changeoverTypeId: data.changeoverTypeId,
      fromProductId: data.fromProductId,
      toProductId: data.toProductId,
      fromSkuId: data.fromSkuId,
      toSkuId: data.toSkuId,
      kind: data.kind ?? 'PLANNED',
      status: data.status ?? 'COMPLETED',
      standardMins: data.standardMins,
      actualMins,
      reason: data.reason,
      remarks: data.remarks,
      startTime: start,
      endTime: end,
      createdById: req!.user!.id,
    },
    include: changeoverInclude,
  });
  await writeAuditLog({
    req,
    action: 'CREATE',
    entity: 'ChangeoverEntry',
    entityId: entry.id,
    after: entry,
  });
  return entry;
}

export async function updateChangeover(
  id: string,
  data: {
    planId?: string | null;
    lineId?: string | null;
    productionDate?: string | Date | null;
    changeoverTypeId?: string;
    fromProductId?: string;
    toProductId?: string;
    fromSkuId?: string | null;
    toSkuId?: string | null;
    kind?: 'PLANNED' | 'UNPLANNED';
    status?: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
    standardMins?: number;
    actualMins?: number;
    reason?: string | null;
    remarks?: string | null;
    startTime?: string | Date | null;
    endTime?: string | Date | null;
  },
  req?: Request,
) {
  const before = await prisma.changeoverEntry.findFirst({
    where: { id, deletedAt: null },
    include: changeoverInclude,
  });
  if (!before) throw new NotFoundError('Changeover entry not found');
  if (before.planId) await getPlan(before.planId, req?.user);

  let start =
    data.startTime !== undefined
      ? data.startTime
        ? new Date(data.startTime)
        : null
      : before.startTime;
  let end =
    data.endTime !== undefined
      ? data.endTime
        ? new Date(data.endTime)
        : null
      : before.endTime;

  if (start && Number.isNaN(start.getTime())) throw new ValidationError('Invalid changeover start time');
  if (end && Number.isNaN(end.getTime())) throw new ValidationError('Invalid changeover end time');
  if (start && end && end <= start) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }

  let actualMins = data.actualMins;
  if ((actualMins == null || Number.isNaN(Number(actualMins))) && start && end) {
    actualMins = minutesBetween(start, end);
  }
  if (actualMins == null) actualMins = before.actualMins;

  const productionDate =
    data.productionDate !== undefined
      ? data.productionDate
        ? parseCalendarDate(data.productionDate)
        : null
      : before.productionDate;

  const entry = await prisma.changeoverEntry.update({
    where: { id },
    data: {
      lineId: data.lineId !== undefined ? data.lineId : before.lineId,
      productionDate,
      changeoverTypeId: data.changeoverTypeId ?? before.changeoverTypeId,
      fromProductId: data.fromProductId ?? before.fromProductId,
      toProductId: data.toProductId ?? before.toProductId,
      fromSkuId: data.fromSkuId !== undefined ? data.fromSkuId : before.fromSkuId,
      toSkuId: data.toSkuId !== undefined ? data.toSkuId : before.toSkuId,
      kind: data.kind ?? before.kind,
      status: data.status ?? before.status,
      standardMins: data.standardMins ?? before.standardMins,
      actualMins,
      reason: data.reason !== undefined ? data.reason : before.reason,
      remarks: data.remarks !== undefined ? data.remarks : before.remarks,
      startTime: start,
      endTime: end,
    },
    include: changeoverInclude,
  });

  await writeAuditLog({
    req,
    action: 'UPDATE',
    entity: 'ChangeoverEntry',
    entityId: id,
    before,
    after: entry,
  });
  return entry;
}

export async function deleteChangeover(id: string, req?: Request) {
  const before = await prisma.changeoverEntry.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw new NotFoundError('Changeover entry not found');
  if (before.planId) await getPlan(before.planId, req?.user);

  await prisma.changeoverEntry.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await writeAuditLog({ req, action: 'DELETE', entity: 'ChangeoverEntry', entityId: id, before });
  return { message: 'Changeover entry deleted' };
}

export async function createManpower(
  data: {
    planId: string;
    headcount: number;
    operators?: number | null;
    helpers?: number | null;
    overtimeMins?: number | null;
    remarks?: string | null;
    recordedAt?: string | Date;
  },
  req?: Request,
) {
  await getPlan(data.planId, req?.user);
  const entry = await prisma.manpowerEntry.create({
    data: {
      planId: data.planId,
      headcount: data.headcount,
      operators: data.operators,
      helpers: data.helpers,
      overtimeMins: data.overtimeMins ?? null,
      remarks: data.remarks,
      recordedAt: data.recordedAt ? new Date(data.recordedAt) : new Date(),
      createdById: req!.user!.id,
    },
  });
  await writeAuditLog({ req, action: 'CREATE', entity: 'ManpowerEntry', entityId: entry.id, after: entry });
  return entry;
}

export async function closeShift(planId: string, remarks: string | null | undefined, req?: Request) {
  const plan = await getPlan(planId, req?.user);
  const existing = await prisma.shiftClosing.findUnique({ where: { planId } });
  if (existing?.status === 'CLOSED') throw new ValidationError('Shift already closed');

  const entries = plan.productionEntries.filter((e) => e.status !== 'REJECTED');
  const totalPlanned = entries.reduce((s, e) => s + e.plannedCases, 0) || plan.plannedCases;
  const totalActual = entries.reduce((s, e) => s + e.actualCases, 0);
  const totalGood = entries.reduce((s, e) => s + e.goodCases, 0);
  const totalReject = entries.reduce((s, e) => s + e.rejectCases, 0);
  const totalDowntime = plan.downtimeEntries.reduce((s, e) => s + e.durationMins, 0);

  const closing = await prisma.shiftClosing.upsert({
    where: { planId },
    create: {
      planId,
      shiftId: plan.shiftId,
      status: 'CLOSED',
      totalPlanned,
      totalActual,
      totalGood,
      totalReject,
      totalDowntime,
      remarks,
      closedAt: new Date(),
      closedById: req!.user!.id,
    },
    update: {
      status: 'CLOSED',
      totalPlanned,
      totalActual,
      totalGood,
      totalReject,
      totalDowntime,
      remarks,
      closedAt: new Date(),
      closedById: req!.user!.id,
    },
  });

  await prisma.productionPlan.update({
    where: { id: planId },
    data: { status: 'COMPLETED' },
  });

  await writeAuditLog({ req, action: 'CLOSE_SHIFT', entity: 'ShiftClosing', entityId: closing.id, after: closing });
  return closing;
}
