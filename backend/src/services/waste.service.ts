import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../config/prisma.js';
import type { AuthUser } from '../middleware/auth.js';
import { NotFoundError } from '../utils/errors.js';

const WASTE_MATERIALS = [
  { code: 'PREFORM', name: 'Preform', defaultUnit: 'pcs', sortOrder: 1 },
  { code: 'BOTTLES', name: 'Bottles', defaultUnit: 'pcs', sortOrder: 2 },
  { code: 'CAP', name: 'Cap', defaultUnit: 'pcs', sortOrder: 3 },
  { code: 'STICKERS', name: 'Stickers', defaultUnit: 'pcs', sortOrder: 4 },
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

function dateRange(from?: string, to?: string) {
  const start = from ? new Date(`${from.slice(0, 10)}T00:00:00.000Z`) : new Date(new Date().setDate(new Date().getDate() - 14));
  const end = to ? new Date(`${to.slice(0, 10)}T23:59:59.999Z`) : new Date();
  if (!to) end.setHours(23, 59, 59, 999);
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
    unit?: string;
    reason: string;
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
  wasteDate = plan.productionDate.toISOString().slice(0, 10);
  shiftId = plan.shiftId;
  lineId = plan.lineId;

  return prisma.wasteEntry.create({
    data: {
      wasteDate: new Date(`${wasteDate}T00:00:00.000Z`),
      materialId: data.materialId,
      quantity: data.quantity,
      unit: data.unit?.trim() || material.defaultUnit,
      reason: data.reason.trim(),
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
    unit?: string;
    reason?: string;
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
    wasteDate = plan.productionDate.toISOString().slice(0, 10);
    shiftId = plan.shiftId;
    lineId = plan.lineId;
  }

  return prisma.wasteEntry.update({
    where: { id },
    data: {
      ...(wasteDate ? { wasteDate: new Date(`${wasteDate}T00:00:00.000Z`) } : {}),
      ...(data.materialId ? { materialId: data.materialId } : {}),
      ...(data.quantity != null ? { quantity: data.quantity } : {}),
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

    const day = e.wasteDate.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + qty);

    const shiftName = e.shift?.name || 'Unassigned';
    byShift.set(shiftName, (byShift.get(shiftName) ?? 0) + qty);
  }

  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
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
    recent: entries.slice(0, 20),
  };
}
