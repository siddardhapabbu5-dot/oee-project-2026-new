import type { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import type { Request } from 'express';
import { prisma } from '../config/prisma.js';
import type { AuthUser } from '../middleware/auth.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const WASTE_MATERIALS = [
  { code: 'PREFORM', name: 'PET Preform', defaultUnit: 'pcs', sortOrder: 1 },
  { code: 'BOTTLES', name: 'Blow Bottles', defaultUnit: 'pcs', sortOrder: 2 },
  { code: 'CAP', name: 'Closure', defaultUnit: 'pcs', sortOrder: 3 },
  { code: 'STICKERS', name: 'Adhesive Label', defaultUnit: 'pcs', sortOrder: 4 },
  { code: 'SHRINK_FILM', name: 'Shrink Film', defaultUnit: 'kg', sortOrder: 5 },
] as const;

export async function ensureWasteMaterials() {
  for (const m of WASTE_MATERIALS) {
    await prisma.wasteMaterial.upsert({
      where: { code: m.code },
      create: { ...m, isActive: true },
      update: { name: m.name, defaultUnit: m.defaultUnit, sortOrder: m.sortOrder, isActive: true, deletedAt: null },
    });
  }
}

export async function listWasteMaterials() {
  await ensureWasteMaterials();
  return prisma.wasteMaterial.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
}

function toCalendarDate(d: Date | string): string {
  if (typeof d === 'string') {
    const m = d.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const dt = d instanceof Date ? d : new Date(d);
  // Prefer UTC y-m-d for @db.Date values (stored as midnight UTC)
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateRange(from?: string, to?: string) {
  const start = from
    ? new Date(`${from.slice(0, 10)}T00:00:00.000Z`)
    : new Date(new Date().setUTCDate(new Date().getUTCDate() - 14));
  const end = to ? new Date(`${to.slice(0, 10)}T23:59:59.999Z`) : new Date();
  if (!to) {
    end.setUTCHours(23, 59, 59, 999);
  }
  return { start, end };
}

const entryInclude = {
  material: { select: { id: true, code: true, name: true, defaultUnit: true } },
  shift: { select: { id: true, name: true, code: true } },
  line: { select: { id: true, name: true, code: true } },
  plan: { select: { id: true, planNumber: true, batchNumber: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.WasteEntryInclude;

export async function listWasteEntries(opts?: {
  from?: string;
  to?: string;
  materialId?: string;
  shiftId?: string;
  lineId?: string;
  planId?: string;
}) {
  const { start, end } = dateRange(opts?.from, opts?.to);
  return prisma.wasteEntry.findMany({
    where: {
      deletedAt: null,
      ...(opts?.planId
        ? { planId: opts.planId }
        : { wasteDate: { gte: start, lte: end } }),
      ...(opts?.materialId ? { materialId: opts.materialId } : {}),
      ...(opts?.shiftId ? { shiftId: opts.shiftId } : {}),
      ...(opts?.lineId ? { lineId: opts.lineId } : {}),
    },
    include: entryInclude,
    orderBy: [{ wasteDate: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function createWasteEntry(
  data: {
    wasteDate: string;
    materialId: string;
    quantity: number;
    actualQtyIssued?: number | null;
    unit?: string;
    reason?: string | null;
    remarks?: string | null;
    shiftId?: string | null;
    lineId?: string | null;
    planId: string;
  },
  req: Request,
) {
  const user = req.user as AuthUser;
  const material = await prisma.wasteMaterial.findFirst({
    where: { id: data.materialId, deletedAt: null, isActive: true },
  });
  if (!material) throw new NotFoundError('Waste material not found');

  let wasteDate = data.wasteDate.slice(0, 10);
  let shiftId = data.shiftId || null;
  let lineId = data.lineId || null;
  const planId = data.planId;

  const plan = await prisma.productionPlan.findFirst({
    where: { id: planId, deletedAt: null },
    select: { productionDate: true, shiftId: true, lineId: true },
  });
  if (!plan) throw new NotFoundError('Work order not found');
  wasteDate = toCalendarDate(plan.productionDate);
  shiftId = plan.shiftId;
  lineId = plan.lineId;

  // Recalculate wastage from issued vs std when plan production is available
  const planFull = await prisma.productionPlan.findFirst({
    where: { id: planId, deletedAt: null },
    include: {
      sku: { select: { packSize: true, packVolume: true } },
      productionEntries: { where: { deletedAt: null }, select: { actualCases: true } },
    },
  });
  const actualCases =
    planFull?.productionEntries.reduce((s, e) => s + (Number(e.actualCases) || 0), 0) ?? 0;
  const packSize = resolvePackSize(planFull?.sku);
  const stdQuantity = actualCases * packSize;
  let quantity = data.quantity;
  const issued = data.actualQtyIssued != null ? Number(data.actualQtyIssued) : null;
  if (issued != null) {
    if (issued < stdQuantity) {
      throw new ValidationError(
        `Actual Qty Issued (${issued}) is less than Std Quantity (${stdQuantity}) — not accepted`,
      );
    }
    quantity = Number((issued - stdQuantity).toFixed(4));
  }

  return prisma.wasteEntry.create({
    data: {
      wasteDate: new Date(`${wasteDate}T00:00:00.000Z`),
      materialId: data.materialId,
      quantity,
      actualQtyIssued: issued,
      unit: data.unit?.trim() || material.defaultUnit,
      reason: data.reason?.trim() || '',
      remarks: data.remarks?.trim() || null,
      shiftId,
      lineId,
      planId,
      createdById: user.id,
    },
    include: entryInclude,
  });
}

export async function updateWasteEntry(
  id: string,
  data: {
    wasteDate?: string;
    materialId?: string;
    quantity?: number;
    actualQtyIssued?: number | null;
    unit?: string;
    reason?: string | null;
    remarks?: string | null;
    shiftId?: string | null;
    lineId?: string | null;
    planId?: string | null;
  },
) {
  const existing = await prisma.wasteEntry.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError('Waste entry not found');

  let unit = data.unit;
  if (data.materialId && data.materialId !== existing.materialId && !unit) {
    const material = await prisma.wasteMaterial.findFirst({ where: { id: data.materialId, deletedAt: null } });
    if (!material) throw new NotFoundError('Waste material not found');
    unit = material.defaultUnit;
  }

  let wasteDate = data.wasteDate ? data.wasteDate.slice(0, 10) : undefined;
  let shiftId = data.shiftId;
  let lineId = data.lineId;
  const planId = data.planId !== undefined ? data.planId || null : undefined;

  if (planId) {
    const plan = await prisma.productionPlan.findFirst({
      where: { id: planId, deletedAt: null },
      select: { productionDate: true, shiftId: true, lineId: true },
    });
    if (!plan) throw new NotFoundError('Work order not found');
    wasteDate = toCalendarDate(plan.productionDate);
    shiftId = plan.shiftId;
    lineId = plan.lineId;
  }

  let quantity = data.quantity;
  let actualQtyIssued = data.actualQtyIssued;
  const effectivePlanId = planId !== undefined ? planId : existing.planId;
  if (actualQtyIssued !== undefined && actualQtyIssued != null && effectivePlanId) {
    const planFull = await prisma.productionPlan.findFirst({
      where: { id: effectivePlanId, deletedAt: null },
      include: {
        sku: { select: { packSize: true, packVolume: true } },
        productionEntries: { where: { deletedAt: null }, select: { actualCases: true } },
      },
    });
    const actualCases =
      planFull?.productionEntries.reduce((s, e) => s + (Number(e.actualCases) || 0), 0) ?? 0;
    const packSize = resolvePackSize(planFull?.sku);
    const stdQuantity = actualCases * packSize;
    const issued = Number(actualQtyIssued);
    if (issued < stdQuantity) {
      throw new ValidationError(
        `Actual Qty Issued (${issued}) is less than Std Quantity (${stdQuantity}) — not accepted`,
      );
    }
    quantity = Number((issued - stdQuantity).toFixed(4));
  }

  return prisma.wasteEntry.update({
    where: { id },
    data: {
      ...(wasteDate ? { wasteDate: new Date(`${wasteDate}T00:00:00.000Z`) } : {}),
      ...(data.materialId ? { materialId: data.materialId } : {}),
      ...(quantity != null ? { quantity } : {}),
      ...(actualQtyIssued !== undefined ? { actualQtyIssued } : {}),
      ...(unit ? { unit } : {}),
      ...(data.reason != null ? { reason: data.reason.trim() } : {}),
      ...(data.remarks !== undefined ? { remarks: data.remarks?.trim() || null } : {}),
      ...(shiftId !== undefined ? { shiftId: shiftId || null } : {}),
      ...(lineId !== undefined ? { lineId: lineId || null } : {}),
      ...(planId !== undefined ? { planId } : {}),
    },
    include: entryInclude,
  });
}

export async function deleteWasteEntry(id: string) {
  const existing = await prisma.wasteEntry.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError('Waste entry not found');
  await prisma.wasteEntry.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id };
}

/** Work-order wise wastage status: PENDING / PARTIAL / COMPLETED */
export async function listWastageWorkOrderStatus(opts?: {
  from?: string;
  to?: string;
  shiftId?: string;
  lineId?: string;
  status?: 'PENDING' | 'PARTIAL' | 'COMPLETED' | 'ALL';
}) {
  await ensureWasteMaterials();
  const materials = await prisma.wasteMaterial.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true },
  });
  const materialCount = materials.length || 5;

  const { start, end } = dateRange(opts?.from, opts?.to);
  const plans = await prisma.productionPlan.findMany({
    where: {
      deletedAt: null,
      productionDate: { gte: start, lte: end },
      ...(opts?.shiftId ? { shiftId: opts.shiftId } : {}),
      ...(opts?.lineId ? { lineId: opts.lineId } : {}),
      status: { not: 'CANCELLED' },
    },
    include: {
      line: { select: { id: true, name: true, code: true } },
      shift: { select: { id: true, name: true, code: true } },
      product: { select: { id: true, name: true } },
      sku: { select: { id: true, code: true, name: true, packVolume: true, packSize: true } },
      productionEntries: { where: { deletedAt: null }, select: { actualCases: true } },
      wasteEntries: {
        where: { deletedAt: null },
        select: { id: true, materialId: true, quantity: true, actualQtyIssued: true },
      },
    },
    orderBy: [{ productionDate: 'desc' }, { planNumber: 'asc' }],
  });

  const rows = plans.map((plan) => {
    const actualCases = plan.productionEntries.reduce((s, e) => s + (Number(e.actualCases) || 0), 0);
    const packSize = resolvePackSize(plan.sku);
    const stdQuantity = actualCases * packSize;
    const filledMaterialIds = new Set(plan.wasteEntries.map((e) => e.materialId));
    const filledCount = filledMaterialIds.size;
    const totalWastageQty = plan.wasteEntries.reduce((s, e) => s + (Number(e.quantity) || 0), 0);

    let wastageStatus: 'PENDING' | 'PARTIAL' | 'COMPLETED' = 'PENDING';
    if (filledCount >= materialCount) wastageStatus = 'COMPLETED';
    else if (filledCount > 0) wastageStatus = 'PARTIAL';

    return {
      planId: plan.id,
      planNumber: plan.planNumber,
      productionDate: toCalendarDate(plan.productionDate),
      batchNumber: plan.batchNumber,
      planStatus: plan.status,
      line: plan.line,
      shift: plan.shift,
      product: plan.product,
      sku: {
        code: plan.sku?.code,
        name: plan.sku?.name,
        packVolume: plan.sku?.packVolume,
        packSize,
      },
      actualCases,
      stdQuantity,
      materialCount,
      filledCount,
      totalWastageQty: Number(totalWastageQty.toFixed(2)),
      wastageStatus,
    };
  });

  const statusFilter = opts?.status && opts.status !== 'ALL' ? opts.status : null;
  const filtered = statusFilter ? rows.filter((r) => r.wastageStatus === statusFilter) : rows;

  const counts = {
    all: rows.length,
    pending: rows.filter((r) => r.wastageStatus === 'PENDING').length,
    partial: rows.filter((r) => r.wastageStatus === 'PARTIAL').length,
    completed: rows.filter((r) => r.wastageStatus === 'COMPLETED').length,
  };

  return { materialCount, counts, rows: filtered };
}

function packSizeFromVolume(volume?: string | null) {
  const v = (volume || '').toUpperCase();
  if (v.includes('200')) return 36;
  if (v.includes('250')) return 30;
  if (v.includes('300') || v.includes('500')) return 24;
  if (v.includes('750') || v.includes('1000')) return 12;
  if (v.includes('2000')) return 6;
  if (v.includes('JAR')) return 1;
  return null;
}

function resolvePackSize(sku?: { packSize?: number | null; packVolume?: string | null } | null) {
  if (sku?.packSize != null && Number(sku.packSize) > 0) return Number(sku.packSize);
  return packSizeFromVolume(sku?.packVolume) ?? 24;
}

/** Excel for one work order — header from production + material waste rows */
export async function exportWasteEntriesExcel(planId: string) {
  if (!planId) throw new NotFoundError('Work order is required');

  const plan = await prisma.productionPlan.findFirst({
    where: { id: planId, deletedAt: null },
    include: {
      line: true,
      shift: true,
      product: true,
      sku: true,
      productionEntries: { where: { deletedAt: null }, select: { actualCases: true } },
    },
  });
  if (!plan) throw new NotFoundError('Work order not found');

  await ensureWasteMaterials();
  const materials = await prisma.wasteMaterial.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  const wasteRows = await prisma.wasteEntry.findMany({
    where: { planId, deletedAt: null },
    include: { material: true },
  });
  const byMaterial = new Map(wasteRows.map((e) => [e.materialId, e]));

  const actualCases = plan.productionEntries.reduce((s, e) => s + (Number(e.actualCases) || 0), 0);
  const packSize = resolvePackSize(plan.sku);
  const stdQuantity = actualCases * packSize;
  const skuLabel = plan.sku?.packVolume || plan.sku?.name || plan.sku?.code || '';
  const planNumber = String(plan.planNumber || '').replace(/^PP-/i, '');
  const dateStr = toCalendarDate(plan.productionDate);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Nakshatra Beverages MES';
  const sheet = workbook.addWorksheet('Wastage Entries');

  sheet.getCell('A1').value = 'Wastage Entries';
  sheet.getCell('A1').font = { bold: true, size: 14 };
  sheet.mergeCells('A1:F1');

  const headerPairs: Array<[string, string | number]> = [
    ['Date', dateStr],
    ['Line No', plan.line?.code || plan.line?.name || ''],
    ['Work order', planNumber],
    ['Shift', plan.shift?.name || ''],
    ['Product', plan.product?.name || ''],
    ['SKU', skuLabel],
    ['Batch', plan.batchNumber || ''],
    ['Pack Size', packSize],
    ['Actual Cases', actualCases],
    ['Std Quantity formula', `Actual Cases × Pack Size = ${actualCases} × ${packSize} = ${stdQuantity}`],
  ];

  let r = 3;
  for (const [label, value] of headerPairs) {
    sheet.getCell(`A${r}`).value = label;
    sheet.getCell(`A${r}`).font = { bold: true };
    sheet.getCell(`B${r}`).value = value;
    r += 1;
  }

  r += 1;
  const tableHeader = [
    'Material',
    'UOM (PCS/KG)',
    'Std Quantity',
    'Actual Qty Issued',
    'Wastage Qty',
    'Wastage %',
    'Reason',
    'Remarks',
  ];
  tableHeader.forEach((h, i) => {
    const cell = sheet.getCell(r, i + 1);
    cell.value = h;
    cell.font = { bold: true };
  });
  r += 1;

  for (const m of materials) {
    const existing = byMaterial.get(m.id);
    const issued = existing?.actualQtyIssued != null ? Number(existing.actualQtyIssued) : null;
    const accepted = issued != null && issued >= stdQuantity;
    const wastage = accepted ? Number((issued - stdQuantity).toFixed(4)) : existing ? Number(existing.quantity) || 0 : 0;
    const pct =
      accepted && issued > 0
        ? Number(((wastage / issued) * 100).toFixed(2))
        : '';
    sheet.getCell(r, 1).value = m.name;
    sheet.getCell(r, 2).value = (existing?.unit || m.defaultUnit || 'pcs').toUpperCase();
    sheet.getCell(r, 3).value = stdQuantity;
    sheet.getCell(r, 4).value = issued != null ? issued : '';
    sheet.getCell(r, 5).value = existing || accepted ? wastage : '';
    sheet.getCell(r, 6).value = pct;
    sheet.getCell(r, 7).value = existing?.reason || '';
    sheet.getCell(r, 8).value = existing?.remarks || '';
    r += 1;
  }

  sheet.getColumn(1).width = 16;
  sheet.getColumn(2).width = 14;
  sheet.getColumn(3).width = 14;
  sheet.getColumn(4).width = 16;
  sheet.getColumn(5).width = 12;
  sheet.getColumn(6).width = 12;
  sheet.getColumn(7).width = 22;
  sheet.getColumn(8).width = 28;

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer: Buffer.from(buffer), planNumber, date: dateStr };
}

export async function getWasteReport(opts?: {
  from?: string;
  to?: string;
  materialId?: string;
  shiftId?: string;
  lineId?: string;
}) {
  const entries = await listWasteEntries(opts);
  const { start, end } = dateRange(opts?.from, opts?.to);

  let totalQty = 0;
  const byMaterial = new Map<string, { name: string; code: string; unit: string; quantity: number; count: number }>();
  const byReason = new Map<string, { quantity: number; count: number }>();
  const byDay = new Map<string, number>();
  const byShift = new Map<string, number>();
  const byWorkOrder = new Map<
    string,
    {
      planId: string;
      planNumber: string;
      date: string;
      line: string;
      shift: string;
      quantity: number;
      count: number;
    }
  >();

  for (const e of entries) {
    const qty = Number(e.quantity) || 0;
    totalQty += qty;
    const matKey = e.materialId;
    const mat = byMaterial.get(matKey) ?? {
      name: e.material.name,
      code: e.material.code,
      unit: e.unit || e.material.defaultUnit,
      quantity: 0,
      count: 0,
    };
    mat.quantity += qty;
    mat.count += 1;
    byMaterial.set(matKey, mat);

    const reason = e.reason || 'Other';
    const r = byReason.get(reason) ?? { quantity: 0, count: 0 };
    r.quantity += qty;
    r.count += 1;
    byReason.set(reason, r);

    const day = toCalendarDate(e.wasteDate);
    byDay.set(day, (byDay.get(day) ?? 0) + qty);

    const shiftName = e.shift?.name || 'Unassigned';
    byShift.set(shiftName, (byShift.get(shiftName) ?? 0) + qty);

    const planKey = e.planId || e.plan?.id || 'none';
    const wo = byWorkOrder.get(planKey) ?? {
      planId: planKey,
      planNumber: e.plan?.planNumber || '—',
      date: day,
      line: e.line?.code || e.line?.name || '—',
      shift: e.shift?.name || '—',
      quantity: 0,
      count: 0,
    };
    wo.quantity += qty;
    wo.count += 1;
    byWorkOrder.set(planKey, wo);
  }

  return {
    from: toCalendarDate(start),
    to: toCalendarDate(end),
    kpis: {
      totalEntries: entries.length,
      totalQuantity: Number(totalQty.toFixed(2)),
      materialCount: byMaterial.size,
      topMaterial: [...byMaterial.values()].sort((a, b) => b.quantity - a.quantity)[0]?.name ?? '—',
      topReason: [...byReason.entries()].sort((a, b) => b[1].quantity - a[1].quantity)[0]?.[0] ?? '—',
    },
    byMaterial: [...byMaterial.values()]
      .map((v) => ({ ...v, quantity: Number(v.quantity.toFixed(2)) }))
      .sort((a, b) => b.quantity - a.quantity),
    byReason: [...byReason.entries()]
      .map(([reason, v]) => ({ reason, quantity: Number(v.quantity.toFixed(2)), count: v.count }))
      .sort((a, b) => b.quantity - a.quantity),
    dailyTrend: [...byDay.entries()]
      .map(([date, quantity]) => ({ date, quantity: Number(quantity.toFixed(2)) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    byShift: [...byShift.entries()]
      .map(([shift, quantity]) => ({ shift, quantity: Number(quantity.toFixed(2)) }))
      .sort((a, b) => b.quantity - a.quantity),
    byWorkOrder: [...byWorkOrder.values()]
      .map((v) => ({ ...v, quantity: Number(v.quantity.toFixed(2)) }))
      .sort((a, b) => b.quantity - a.quantity),
    recent: entries.slice(0, 20),
  };
}
