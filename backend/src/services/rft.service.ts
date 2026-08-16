import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { writeAuditLog } from '../utils/audit.js';
import { calendarDateRange, parseCalendarDate, toCalendarDate } from '../utils/dates.js';
import type { Request } from 'express';
import type { AuthUser } from '../middleware/auth.js';

const AREA_SEED: Array<{
  code: string;
  name: string;
  shortLabel: string;
  sortOrder: number;
  types: Array<{ code: string; name: string; example: string; sortOrder: number }>;
}> = [
  {
    code: 'FILLING',
    name: 'Filling Machine',
    shortLabel: 'Filling',
    sortOrder: 10,
    types: [
      { code: 'UNDERFILL', name: 'Underfill', example: 'Low filling volume', sortOrder: 1 },
      { code: 'OVERFILL', name: 'Overfill', example: 'High filling volume', sortOrder: 2 },
      { code: 'LEAKAGE', name: 'Bottle leakage', example: 'Leakage', sortOrder: 3 },
    ],
  },
  {
    code: 'CAPPING',
    name: 'Capping Machine',
    shortLabel: 'Capping',
    sortOrder: 20,
    types: [
      { code: 'LOOSE_CAP', name: 'Loose Cap', example: 'Torque issue', sortOrder: 1 },
      { code: 'CAP_DAMAGE', name: 'Cap Damage', example: 'Damaged cap', sortOrder: 2 },
    ],
  },
  {
    code: 'LABEL',
    name: 'Labeling Machine',
    shortLabel: 'Label',
    sortOrder: 30,
    types: [
      { code: 'WRINKLE', name: 'Label Wrinkle', example: 'Label defect', sortOrder: 1 },
      { code: 'WRONG_LABEL', name: 'Wrong Label', example: 'SKU mix-up', sortOrder: 2 },
    ],
  },
  {
    code: 'CODING',
    name: 'Coding / Batch Printing',
    shortLabel: 'Coding',
    sortOrder: 40,
    types: [
      { code: 'WRONG_DATE', name: 'Wrong Date', example: 'Coding error', sortOrder: 1 },
      { code: 'MISSING_CODE', name: 'Missing Code', example: 'Printer issue', sortOrder: 2 },
    ],
  },
  {
    code: 'PACKING',
    name: 'Packing Machine',
    shortLabel: 'Packing',
    sortOrder: 50,
    types: [
      { code: 'WRONG_COUNT', name: 'Wrong Count', example: 'Case quantity error', sortOrder: 1 },
      { code: 'DAMAGED_PACK', name: 'Damaged Pack', example: 'Shrink/carton defect', sortOrder: 2 },
    ],
  },
  {
    code: 'BOTTLE',
    name: 'Bottle / Blow Moulding',
    shortLabel: 'Bottle',
    sortOrder: 60,
    types: [
      { code: 'DAMAGE', name: 'Bottle Damage', example: 'Crack/deformation', sortOrder: 1 },
    ],
  },
];

const entryInclude = {
  line: { select: { id: true, code: true, name: true, plantId: true } },
  shift: { select: { id: true, code: true, name: true } },
  product: { select: { id: true, name: true, brand: { select: { name: true } } } },
  sku: { select: { id: true, code: true, name: true, packVolume: true } },
  rejects: {
    where: { deletedAt: null },
    include: {
      area: { select: { id: true, code: true, name: true, shortLabel: true, sortOrder: true } },
      rejectType: { select: { id: true, code: true, name: true, example: true } },
    },
  },
} satisfies Prisma.RftEntryInclude;

function scopeLines(user?: AuthUser): Prisma.RftEntryWhereInput {
  if (!user) return {};
  if (user.role === 'LINE_SUPERVISOR') {
    return { OR: [{ line: { supervisorId: user.id } }, { createdById: user.id }] };
  }
  if (user.role === 'PRODUCTION_MANAGER' && user.plantId) {
    return { OR: [{ plantId: user.plantId }, { line: { plantId: user.plantId } }] };
  }
  return {};
}

export async function ensureRejectAreas() {
  for (const area of AREA_SEED) {
    const existing = await prisma.rejectArea.findFirst({
      where: { code: area.code },
    });
    let areaId = existing?.id;
    if (!existing) {
      const created = await prisma.rejectArea.create({
        data: {
          code: area.code,
          name: area.name,
          shortLabel: area.shortLabel,
          sortOrder: area.sortOrder,
        },
      });
      areaId = created.id;
    } else if (existing.deletedAt) {
      await prisma.rejectArea.update({
        where: { id: existing.id },
        data: { deletedAt: null, isActive: true, name: area.name, shortLabel: area.shortLabel, sortOrder: area.sortOrder },
      });
    }
    if (!areaId) continue;
    for (const t of area.types) {
      const type = await prisma.rejectType.findFirst({
        where: { areaId, code: t.code },
      });
      if (!type) {
        await prisma.rejectType.create({
          data: {
            areaId,
            code: t.code,
            name: t.name,
            example: t.example,
            sortOrder: t.sortOrder,
          },
        });
      } else if (type.deletedAt) {
        await prisma.rejectType.update({
          where: { id: type.id },
          data: { deletedAt: null, isActive: true, name: t.name, example: t.example, sortOrder: t.sortOrder },
        });
      }
    }
  }
}

export async function listRejectAreas() {
  await ensureRejectAreas();
  return prisma.rejectArea.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      types: {
        where: { deletedAt: null, isActive: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
}

function shapeEntry(entry: Prisma.RftEntryGetPayload<{ include: typeof entryInclude }>) {
  const byArea: Record<string, number> = {};
  let totalReject = 0;
  for (const r of entry.rejects) {
    const qty = Number(r.quantity) || 0;
    totalReject += qty;
    byArea[r.area.code] = (byArea[r.area.code] ?? 0) + qty;
  }
  const produced = Number(entry.totalProduced) || 0;
  const firstTimeGood = Math.max(0, produced - totalReject);
  const rft = produced > 0 ? Number(((firstTimeGood / produced) * 100).toFixed(2)) : null;
  return {
    ...entry,
    entryDate: toCalendarDate(entry.entryDate),
    byArea,
    totalReject,
    firstTimeGood,
    rft,
  };
}

export async function listRftEntries(
  user?: AuthUser,
  opts?: { from?: string; to?: string; lineId?: string; shiftId?: string; productId?: string },
) {
  await ensureRejectAreas();
  const { start, end } = calendarDateRange(opts?.from, opts?.to, 31);
  const rows = await prisma.rftEntry.findMany({
    where: {
      deletedAt: null,
      entryDate: { gte: start, lte: end },
      ...(opts?.lineId ? { lineId: opts.lineId } : {}),
      ...(opts?.shiftId ? { shiftId: opts.shiftId } : {}),
      ...(opts?.productId ? { productId: opts.productId } : {}),
      ...scopeLines(user),
    },
    include: entryInclude,
    orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
  });
  return rows.map(shapeEntry);
}

export async function getRftEntry(id: string, user?: AuthUser) {
  const entry = await prisma.rftEntry.findFirst({
    where: { id, deletedAt: null, ...scopeLines(user) },
    include: entryInclude,
  });
  if (!entry) throw new NotFoundError('RFT entry not found');
  return shapeEntry(entry);
}

type RejectInput = { areaId: string; rejectTypeId?: string | null; quantity: number };

async function syncRejects(tx: Prisma.TransactionClient, rftEntryId: string, rejects: RejectInput[]) {
  const now = new Date();
  await tx.rftRejectQty.updateMany({
    where: { rftEntryId, deletedAt: null },
    data: { deletedAt: now },
  });
  const rows = rejects
    .map((r) => ({
      areaId: r.areaId,
      rejectTypeId: r.rejectTypeId || null,
      quantity: Number(r.quantity) || 0,
    }))
    .filter((r) => r.quantity > 0);
  if (rows.length === 0) return;
  await tx.rftRejectQty.createMany({
    data: rows.map((r) => ({
      rftEntryId,
      areaId: r.areaId,
      rejectTypeId: r.rejectTypeId,
      quantity: r.quantity,
    })),
  });
}

export async function createRftEntry(
  data: {
    entryDate: string;
    lineId: string;
    shiftId: string;
    productId: string;
    skuId: string;
    totalProduced: number;
    remarks?: string | null;
    rejects?: RejectInput[];
  },
  req?: Request,
) {
  await ensureRejectAreas();
  if (data.totalProduced < 0) throw new ValidationError('Total produced cannot be negative');
  const rejects = data.rejects ?? [];
  const totalReject = rejects.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  if (totalReject > data.totalProduced + 0.0001) {
    throw new ValidationError('Total reject cannot exceed total produced');
  }

  const line = await prisma.productionLine.findFirst({ where: { id: data.lineId, deletedAt: null } });
  if (!line) throw new NotFoundError('Line not found');
  const entryDate = parseCalendarDate(data.entryDate);

  const existing = await prisma.rftEntry.findFirst({
    where: {
      deletedAt: null,
      entryDate,
      lineId: data.lineId,
      shiftId: data.shiftId,
      skuId: data.skuId,
    },
  });
  if (existing) {
    throw new ValidationError('RFT entry already exists for this date, shift, line and SKU — edit it instead');
  }

  const entry = await prisma.$transaction(async (tx) => {
    const created = await tx.rftEntry.create({
      data: {
        entryDate,
        plantId: line.plantId,
        lineId: data.lineId,
        shiftId: data.shiftId,
        productId: data.productId,
        skuId: data.skuId,
        totalProduced: data.totalProduced,
        remarks: data.remarks ?? null,
        createdById: req?.user?.id,
      },
    });
    await syncRejects(tx, created.id, rejects);
    return tx.rftEntry.findFirstOrThrow({ where: { id: created.id }, include: entryInclude });
  });

  await writeAuditLog({ req, action: 'CREATE', entity: 'RftEntry', entityId: entry.id, after: entry });
  return shapeEntry(entry);
}

export async function updateRftEntry(
  id: string,
  data: {
    entryDate?: string;
    lineId?: string;
    shiftId?: string;
    productId?: string;
    skuId?: string;
    totalProduced?: number;
    remarks?: string | null;
    rejects?: RejectInput[];
  },
  req?: Request,
) {
  const before = await prisma.rftEntry.findFirst({
    where: { id, deletedAt: null, ...scopeLines(req?.user) },
    include: entryInclude,
  });
  if (!before) throw new NotFoundError('RFT entry not found');

  const totalProduced = data.totalProduced ?? before.totalProduced;
  const rejects = data.rejects;
  if (rejects) {
    const totalReject = rejects.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    if (totalReject > totalProduced + 0.0001) {
      throw new ValidationError('Total reject cannot exceed total produced');
    }
  }

  let plantId = before.plantId;
  const lineId = data.lineId ?? before.lineId;
  if (data.lineId && data.lineId !== before.lineId) {
    const line = await prisma.productionLine.findFirst({ where: { id: data.lineId, deletedAt: null } });
    if (!line) throw new NotFoundError('Line not found');
    plantId = line.plantId;
  }

  const entry = await prisma.$transaction(async (tx) => {
    await tx.rftEntry.update({
      where: { id },
      data: {
        entryDate: data.entryDate ? parseCalendarDate(data.entryDate) : undefined,
        plantId: plantId ?? undefined,
        lineId,
        shiftId: data.shiftId,
        productId: data.productId,
        skuId: data.skuId,
        totalProduced,
        remarks: data.remarks === undefined ? undefined : data.remarks,
      },
    });
    if (rejects) await syncRejects(tx, id, rejects);
    return tx.rftEntry.findFirstOrThrow({ where: { id }, include: entryInclude });
  });

  await writeAuditLog({ req, action: 'UPDATE', entity: 'RftEntry', entityId: id, before, after: entry });
  return shapeEntry(entry);
}

export async function deleteRftEntry(id: string, req?: Request) {
  const before = await prisma.rftEntry.findFirst({
    where: { id, deletedAt: null, ...scopeLines(req?.user) },
  });
  if (!before) throw new NotFoundError('RFT entry not found');
  const now = new Date();
  await prisma.$transaction([
    prisma.rftRejectQty.updateMany({ where: { rftEntryId: id, deletedAt: null }, data: { deletedAt: now } }),
    prisma.rftEntry.update({ where: { id }, data: { deletedAt: now } }),
  ]);
  await writeAuditLog({ req, action: 'DELETE', entity: 'RftEntry', entityId: id, before });
  return { message: 'RFT entry deleted' };
}

/** Dashboard: FTG = Produced − Total Reject; RFT% = FTG ÷ Produced × 100 */
export async function getRftDashboard(
  user?: AuthUser,
  opts?: { from?: string; to?: string; lineId?: string; shiftId?: string },
) {
  await ensureRejectAreas();
  const areas = await listRejectAreas();
  const { start, end } = calendarDateRange(opts?.from, opts?.to, 31);
  const entries = await prisma.rftEntry.findMany({
    where: {
      deletedAt: null,
      entryDate: { gte: start, lte: end },
      ...(opts?.lineId ? { lineId: opts.lineId } : {}),
      ...(opts?.shiftId ? { shiftId: opts.shiftId } : {}),
      ...scopeLines(user),
    },
    include: entryInclude,
    orderBy: [{ entryDate: 'asc' }],
  });

  const shaped = entries.map(shapeEntry);
  let totalProduced = 0;
  let totalReject = 0;
  const areaTotals: Record<string, number> = {};
  const typeTotals = new Map<string, { name: string; area: string; quantity: number }>();
  const byDay = new Map<string, { produced: number; reject: number }>();
  const byLine = new Map<string, { name: string; produced: number; reject: number }>();
  const byShift = new Map<string, { name: string; produced: number; reject: number }>();
  const byProduct = new Map<string, { name: string; produced: number; reject: number }>();

  for (const area of areas) areaTotals[area.code] = 0;

  for (const e of shaped) {
    totalProduced += e.totalProduced;
    totalReject += e.totalReject;
    const date = e.entryDate;
    const day = byDay.get(date) ?? { produced: 0, reject: 0 };
    day.produced += e.totalProduced;
    day.reject += e.totalReject;
    byDay.set(date, day);

    const lineName = e.line.code || e.line.name;
    const line = byLine.get(e.lineId) ?? { name: lineName, produced: 0, reject: 0 };
    line.produced += e.totalProduced;
    line.reject += e.totalReject;
    byLine.set(e.lineId, line);

    const shift = byShift.get(e.shiftId) ?? { name: e.shift.name, produced: 0, reject: 0 };
    shift.produced += e.totalProduced;
    shift.reject += e.totalReject;
    byShift.set(e.shiftId, shift);

    const productName =
      e.product.brand?.name
        ? `${e.product.brand.name} ${e.sku.packVolume || e.sku.name || ''}`.trim()
        : e.product.name;
    const product = byProduct.get(e.productId) ?? { name: productName, produced: 0, reject: 0 };
    product.produced += e.totalProduced;
    product.reject += e.totalReject;
    byProduct.set(e.productId, product);

    for (const [code, qty] of Object.entries(e.byArea)) {
      areaTotals[code] = (areaTotals[code] ?? 0) + qty;
    }
    for (const r of e.rejects) {
      if (!r.rejectType) continue;
      const key = r.rejectType.id;
      const row = typeTotals.get(key) ?? {
        name: r.rejectType.name,
        area: r.area.shortLabel,
        quantity: 0,
      };
      row.quantity += Number(r.quantity) || 0;
      typeTotals.set(key, row);
    }
  }

  const firstTimeGood = Math.max(0, totalProduced - totalReject);
  const rft = totalProduced > 0 ? Number(((firstTimeGood / totalProduced) * 100).toFixed(2)) : null;
  const defectRate = totalProduced > 0 ? Number(((totalReject / totalProduced) * 100).toFixed(2)) : 0;

  const metricOf = (produced: number, reject: number) => {
    const ftg = Math.max(0, produced - reject);
    return {
      produced,
      totalReject: reject,
      firstTimeGood: ftg,
      rft: produced > 0 ? Number(((ftg / produced) * 100).toFixed(2)) : 0,
    };
  };

  const byArea = areas.map((a) => {
    const quantity = areaTotals[a.code] ?? 0;
    const pct = totalReject > 0 ? Number(((quantity / totalReject) * 100).toFixed(1)) : 0;
    return {
      code: a.code,
      name: a.shortLabel,
      fullName: a.name,
      quantity,
      pct,
    };
  });

  const pareto = [...byArea]
    .filter((a) => a.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity)
    .map((a, i, arr) => {
      const cum = arr.slice(0, i + 1).reduce((s, x) => s + x.quantity, 0);
      return {
        ...a,
        cumulativePct: totalReject > 0 ? Number(((cum / totalReject) * 100).toFixed(1)) : 0,
      };
    });

  const byType = [...typeTotals.values()]
    .filter((t) => t.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 12)
    .map((t) => ({
      ...t,
      pct: totalReject > 0 ? Number(((t.quantity / totalReject) * 100).toFixed(1)) : 0,
    }));

  return {
    from: toCalendarDate(start),
    to: toCalendarDate(end),
    formula: 'RFT % = (Total Produced − Total Reject) ÷ Total Produced × 100',
    areas: areas.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      shortLabel: a.shortLabel,
      types: a.types.map((t) => ({ id: t.id, code: t.code, name: t.name, example: t.example })),
    })),
    kpis: {
      totalProduced,
      totalReject,
      firstTimeGood,
      rft,
      defectRate,
      entryCount: shaped.length,
    },
    trend: [...byDay.entries()]
      .map(([date, v]) => ({ date, ...metricOf(v.produced, v.reject) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    byLine: [...byLine.values()]
      .map((v) => ({ name: v.name, ...metricOf(v.produced, v.reject) }))
      .sort((a, b) => b.produced - a.produced),
    byShift: [...byShift.values()]
      .map((v) => ({ name: v.name, ...metricOf(v.produced, v.reject) }))
      .sort((a, b) => b.produced - a.produced),
    byProduct: [...byProduct.values()]
      .map((v) => ({ name: v.name, ...metricOf(v.produced, v.reject) }))
      .sort((a, b) => b.produced - a.produced)
      .slice(0, 12),
    byArea,
    pareto,
    byType,
    rows: shaped
      .map((e) => ({
        id: e.id,
        date: e.entryDate,
        shift: e.shift.name,
        line: e.line.code || e.line.name,
        product:
          e.product.brand?.name
            ? `${e.product.brand.name} ${e.sku.packVolume || e.sku.name || ''}`.trim()
            : e.product.name,
        sku: e.sku.packVolume || e.sku.name || e.sku.code,
        totalProduced: e.totalProduced,
        byArea: e.byArea,
        totalReject: e.totalReject,
        firstTimeGood: e.firstTimeGood,
        rft: e.rft,
      }))
      .sort((a, b) => b.date.localeCompare(a.date) || a.line.localeCompare(b.line)),
  };
}
