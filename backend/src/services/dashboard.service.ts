import { prisma } from '../config/prisma.js';
import type { AuthUser } from '../middleware/auth.js';
import type { Prisma } from '@prisma/client';
import {
  calcAchievement,
  calcCapacityUtilization,
  calcLoss,
  computeOeeMetrics,
  isPlannedProductionLossCategory,
} from '../utils/oee.js';
import { calendarDateRange, toCalendarDate } from '../utils/dates.js';

function dateRange(from?: string, to?: string) {
  return calendarDateRange(from, to, 14);
}

function toDateKey(d: Date) {
  return toCalendarDate(d);
}

function planScope(user?: AuthUser): Prisma.ProductionPlanWhereInput {
  if (!user) return {};
  if (user.role === 'LINE_SUPERVISOR') {
    return { OR: [{ supervisorId: user.id }, { line: { supervisorId: user.id } }] };
  }
  if (user.role === 'PRODUCTION_MANAGER' && user.plantId) {
    return { plantId: user.plantId };
  }
  return {};
}

type PlanAgg = {
  actual: number;
  good: number;
  reject: number;
  downtime: number;
  plannedLoss: number;
};

async function loadDashboardCore(user?: AuthUser, from?: string, to?: string, shiftId?: string) {
  const { start, end } = dateRange(from, to);
  const planWhere: Prisma.ProductionPlanWhereInput = {
    deletedAt: null,
    productionDate: { gte: start, lte: end },
    ...(shiftId ? { shiftId } : {}),
    ...planScope(user),
  };

  const plans = await prisma.productionPlan.findMany({
    where: planWhere,
    select: {
      id: true,
      plannedCases: true,
      plannedOperatingMins: true,
      productionDate: true,
      line: { select: { name: true } },
      shift: { select: { name: true } },
      product: { select: { name: true } },
    },
    orderBy: { productionDate: 'asc' },
  });

  const planIds = plans.map((p) => p.id);
  const emptyAgg = (): PlanAgg => ({ actual: 0, good: 0, reject: 0, downtime: 0, plannedLoss: 0 });
  const byPlan = new Map<string, PlanAgg>();

  if (planIds.length > 0) {
    // One downtime groupBy by plan+category covers totals, PPL split, and category chart
    const [entryAggs, dtByPlanCategory, dtByMachine, changeovers] = await Promise.all([
      prisma.productionEntry.groupBy({
        by: ['planId'],
        where: { deletedAt: null, status: { not: 'REJECTED' }, planId: { in: planIds } },
        _sum: { actualCases: true, goodCases: true, rejectCases: true },
      }),
      prisma.downtimeEntry.groupBy({
        by: ['planId', 'categoryId'],
        where: { deletedAt: null, planId: { in: planIds } },
        _sum: { durationMins: true },
      }),
      prisma.downtimeEntry.groupBy({
        by: ['machineId'],
        where: { deletedAt: null, planId: { in: planIds }, machineId: { not: null } },
        _sum: { durationMins: true },
      }),
      prisma.changeoverEntry.groupBy({
        by: ['planId'],
        where: { deletedAt: null, planId: { in: planIds } },
        _sum: { actualMins: true },
        _count: { _all: true },
      }),
    ]);

    for (const row of entryAggs) {
      const a = byPlan.get(row.planId) ?? emptyAgg();
      a.actual = Number(row._sum.actualCases ?? 0);
      a.good = Number(row._sum.goodCases ?? 0);
      a.reject = Number(row._sum.rejectCases ?? 0);
      byPlan.set(row.planId, a);
    }

    const categoryIds = [...new Set(dtByPlanCategory.map((r) => r.categoryId))];
    const machineIds = dtByMachine.map((r) => r.machineId).filter((id): id is string => !!id);
    const [categories, machines] = await Promise.all([
      categoryIds.length
        ? prisma.downtimeCategory.findMany({
            where: { id: { in: categoryIds } },
            select: { id: true, name: true, code: true },
          })
        : Promise.resolve([] as Array<{ id: string; name: string; code: string }>),
      machineIds.length
        ? prisma.machine.findMany({
            where: { id: { in: machineIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as Array<{ id: string; name: string }>),
    ]);
    const catMeta = new Map(categories.map((c) => [c.id, c]));
    const catName = new Map(categories.map((c) => [c.id, c.name]));
    const machName = new Map(machines.map((m) => [m.id, m.name]));

    const downtimeByCategoryMap = new Map<string, number>();
    const downtimeByCategoryKey = new Map<string, string>();
    for (const row of dtByPlanCategory) {
      const mins = Number(row._sum.durationMins ?? 0);
      const a = byPlan.get(row.planId) ?? emptyAgg();
      a.downtime += mins;
      const meta = catMeta.get(row.categoryId);
      if (isPlannedProductionLossCategory(meta?.name, meta?.code)) {
        a.plannedLoss += mins;
      }
      byPlan.set(row.planId, a);

      const raw = catName.get(row.categoryId) || 'Other';
      const name = raw.trim() || 'Other';
      const key = name.toLowerCase();
      const rounded = Math.round(mins);
      const existingName = downtimeByCategoryKey.get(key);
      if (existingName) {
        downtimeByCategoryMap.set(existingName, (downtimeByCategoryMap.get(existingName) ?? 0) + rounded);
      } else {
        downtimeByCategoryKey.set(key, name);
        downtimeByCategoryMap.set(name, rounded);
      }
    }

    const downtimeByCategory = [...downtimeByCategoryMap.entries()]
      .map(([name, minutes]) => ({ name, minutes }))
      .filter((r) => r.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes);

    const downtimeByMachine = dtByMachine
      .map((r) => ({
        name: (r.machineId && machName.get(r.machineId)) || 'Unassigned',
        minutes: Math.round(Number(r._sum.durationMins ?? 0)),
      }))
      .sort((a, b) => b.minutes - a.minutes);

    const changeoverByPlan = new Map(
      changeovers
        .filter((c): c is typeof c & { planId: string } => !!c.planId)
        .map((c) => [c.planId, { count: c._count._all, actualMins: Number(c._sum.actualMins ?? 0) }]),
    );

    return {
      plans,
      byPlan,
      downtimeByCategory,
      downtimeByMachine,
      changeoverByPlan,
      start,
      end,
    };
  }

  return {
    plans,
    byPlan,
    downtimeByCategory: [] as Array<{ name: string; minutes: number }>,
    downtimeByMachine: [] as Array<{ name: string; minutes: number }>,
    changeoverByPlan: new Map<string, { count: number; actualMins: number }>(),
    start,
    end,
  };
}

function assembleDashboard(core: Awaited<ReturnType<typeof loadDashboardCore>>) {
  const { plans, byPlan, downtimeByCategory, downtimeByMachine, changeoverByPlan } = core;

  let plannedCases = 0;
  let actualCases = 0;
  let goodCases = 0;
  let rejectCases = 0;
  let downtime = 0;
  let plannedLossMins = 0;
  let plannedMins = 0;
  let scheduledMins = 0;
  let runTimeMins = 0;
  let wAvail = 0;
  let wPerf = 0;
  let wQual = 0;
  let wOee = 0;
  let weightSum = 0;
  let idealCycleWeighted = 0;

  const dailyMap = new Map<string, { planned: number; actual: number; good: number; reject: number; downtime: number }>();
  const monthlyMap = new Map<string, { planned: number; actual: number }>();
  const shiftMap = new Map<string, { planned: number; actual: number }>();
  const lineMap = new Map<string, { planned: number; actual: number; downtime: number }>();
  const productMap = new Map<string, number>();
  const changeoverTrend = new Map<string, { count: number; actualMins: number }>();
  const oeeDay = new Map<string, { wOee: number; wA: number; wP: number; wQ: number; weight: number }>();
  const capacityDay = new Map<string, { actual: number; planned: number }>();
  const rejectDay = new Map<string, { reject: number; good: number }>();

  for (const plan of plans) {
    const agg = byPlan.get(plan.id) ?? { actual: 0, good: 0, reject: 0, downtime: 0, plannedLoss: 0 };
    const a = agg.actual;
    const g = agg.good;
    const r = agg.reject;
    const dt = agg.downtime;
    const ppl = agg.plannedLoss;
    const totalCount = a || g + r;
    const goodCount = g > 0 ? g : totalCount;
    const dateKey = toDateKey(plan.productionDate);
    const monthKey = dateKey.slice(0, 7);

    plannedCases += plan.plannedCases;
    scheduledMins += plan.plannedOperatingMins;
    actualCases += a;
    goodCases += g;
    rejectCases += r;
    plannedLossMins += ppl;

    const metrics = computeOeeMetrics({
      plannedProductionTimeMins: plan.plannedOperatingMins,
      downtimeMins: dt,
      plannedLossMins: ppl,
      plannedCount: plan.plannedCases,
      totalCount,
      goodCount,
    });

    plannedMins += metrics.plannedProductionTimeMins;
    downtime += metrics.downtimeMins;

    const weight = Math.max(0, metrics.plannedProductionTimeMins) || 0;
    if (weight > 0) {
      wAvail += metrics.availability * weight;
      wPerf += metrics.performance * weight;
      wQual += metrics.quality * weight;
      wOee += metrics.oee * weight;
      idealCycleWeighted += metrics.idealCycleTimeMins * weight;
      weightSum += weight;

      const od = oeeDay.get(dateKey) ?? { wOee: 0, wA: 0, wP: 0, wQ: 0, weight: 0 };
      od.wOee += metrics.oee * weight;
      od.wA += metrics.availability * weight;
      od.wP += metrics.performance * weight;
      od.wQ += metrics.quality * weight;
      od.weight += weight;
      oeeDay.set(dateKey, od);
    }
    runTimeMins += metrics.runTimeMins;

    const d = dailyMap.get(dateKey) ?? { planned: 0, actual: 0, good: 0, reject: 0, downtime: 0 };
    d.planned += plan.plannedCases;
    d.actual += a;
    d.good += g;
    d.reject += r;
    d.downtime += dt;
    dailyMap.set(dateKey, d);

    const m = monthlyMap.get(monthKey) ?? { planned: 0, actual: 0 };
    m.planned += plan.plannedCases;
    m.actual += a;
    monthlyMap.set(monthKey, m);

    const s = shiftMap.get(plan.shift.name) ?? { planned: 0, actual: 0 };
    s.planned += plan.plannedCases;
    s.actual += a;
    shiftMap.set(plan.shift.name, s);

    const l = lineMap.get(plan.line.name) ?? { planned: 0, actual: 0, downtime: 0 };
    l.planned += plan.plannedCases;
    l.actual += a;
    l.downtime += dt;
    lineMap.set(plan.line.name, l);

    productMap.set(plan.product.name, (productMap.get(plan.product.name) ?? 0) + a);

    const co = changeoverByPlan.get(plan.id);
    if (co) {
      const ct = changeoverTrend.get(dateKey) ?? { count: 0, actualMins: 0 };
      ct.count += co.count;
      ct.actualMins += co.actualMins;
      changeoverTrend.set(dateKey, ct);
    }

    const cap = capacityDay.get(dateKey) ?? { actual: 0, planned: 0 };
    cap.actual += a;
    cap.planned += plan.plannedCases;
    capacityDay.set(dateKey, cap);

    const rej = rejectDay.get(dateKey) ?? { reject: 0, good: 0 };
    rej.reject += r;
    rej.good += g;
    rejectDay.set(dateKey, rej);
  }

  const availability = weightSum ? Number((wAvail / weightSum).toFixed(2)) : 0;
  const performance = weightSum ? Number((wPerf / weightSum).toFixed(2)) : 0;
  const quality = weightSum ? Number((wQual / weightSum).toFixed(2)) : 0;
  const oeeFromComponents = Number((((availability / 100) * (performance / 100) * (quality / 100)) * 100).toFixed(2));
  const oeeWeighted = weightSum ? Number((wOee / weightSum).toFixed(2)) : 0;
  const oee = oeeFromComponents || oeeWeighted;

  const kpis = {
    plannedCases,
    actualCases,
    achievement: calcAchievement(plannedCases, actualCases),
    productionLoss: calcLoss(plannedCases, actualCases),
    goodCases,
    rejectCases,
    oee,
    availability,
    performance,
    quality,
    runTimeMins: Number(runTimeMins.toFixed(2)),
    plannedProductionTimeMins: Number(plannedMins.toFixed(2)),
    scheduledProductionTimeMins: Number(scheduledMins.toFixed(2)),
    plannedLossMins: Number(plannedLossMins.toFixed(2)),
    idealCycleTimeMins: weightSum ? Number((idealCycleWeighted / weightSum).toFixed(6)) : 0,
    downtime,
    capacityUtilization: calcCapacityUtilization(actualCases, plannedCases),
    planCount: plans.length,
  };

  const charts = {
    planVsActual: [...dailyMap.entries()].map(([date, v]) => ({
      date,
      planned: v.planned,
      actual: v.actual,
    })),
    dailyTrend: [...dailyMap.entries()].map(([date, v]) => ({
      date,
      actual: v.actual,
      good: v.good,
    })),
    monthlyTrend: [...monthlyMap.entries()].map(([month, v]) => ({
      month,
      planned: v.planned,
      actual: v.actual,
    })),
    shiftPerformance: [...shiftMap.entries()].map(([shift, v]) => ({
      shift,
      planned: v.planned,
      actual: v.actual,
    })),
    linePerformance: [...lineMap.entries()].map(([line, v]) => ({
      line,
      planned: v.planned,
      actual: v.actual,
      downtime: v.downtime,
    })),
    oeeTrend: [...oeeDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        oee: v.weight ? Number((v.wOee / v.weight).toFixed(2)) : 0,
        availability: v.weight ? Number((v.wA / v.weight).toFixed(2)) : 0,
        performance: v.weight ? Number((v.wP / v.weight).toFixed(2)) : 0,
        quality: v.weight ? Number((v.wQ / v.weight).toFixed(2)) : 0,
      })),
    downtimeByCategory,
    downtimeByMachine,
    productContribution: [...productMap.entries()]
      .map(([name, actual]) => ({ name, actual }))
      .sort((a, b) => b.actual - a.actual)
      .slice(0, 10),
    capacityUtilization: [...capacityDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        utilization: calcCapacityUtilization(v.actual, v.planned),
      })),
    changeoverTrend: [...changeoverTrend.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v })),
    rejectAnalysis: [...rejectDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, reject: v.reject, good: v.good })),
  };

  return { kpis, charts };
}

export async function getDashboardSummary(user?: AuthUser, from?: string, to?: string, shiftId?: string) {
  const core = await loadDashboardCore(user, from, to, shiftId);
  return assembleDashboard(core);
}

export async function getDashboardKpis(user?: AuthUser, from?: string, to?: string, shiftId?: string) {
  return (await getDashboardSummary(user, from, to, shiftId)).kpis;
}

export async function getDashboardCharts(user?: AuthUser, from?: string, to?: string, shiftId?: string) {
  return (await getDashboardSummary(user, from, to, shiftId)).charts;
}

export async function getPendingApprovals(user?: AuthUser) {
  return prisma.productionEntry.findMany({
    where: {
      deletedAt: null,
      status: 'SUBMITTED',
      plan: { deletedAt: null, ...planScope(user) },
    },
    include: {
      plan: {
        include: {
          line: true,
          product: true,
          shift: true,
        },
      },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

/**
 * Production Plan vs Actual — product-wise clustered view with Brand & SKU filters.
 * Variance = Actual Cases − Planned Cases
 *
 * SKU filter matches exact skuId OR the same pack volume (e.g. "500 ML"),
 * so brand-specific SKUs still find plans that used the shared catalog SKU.
 */
export async function getPlanVsActualDashboard(
  user?: AuthUser,
  filters?: { from?: string; to?: string; brandId?: string; skuId?: string; packVolume?: string },
) {
  const { start, end } = calendarDateRange(filters?.from, filters?.to, 30);

  let packVolume = filters?.packVolume?.trim() || '';
  if (!packVolume && filters?.skuId) {
    const selectedSku = await prisma.sku.findFirst({
      where: { id: filters.skuId, deletedAt: null },
      select: { id: true, packVolume: true, name: true, code: true },
    });
    packVolume = (selectedSku?.packVolume || '').trim();
    if (!packVolume && selectedSku?.name) {
      const m = selectedSku.name.match(/(\d+\s*ML|\d+\s*L|Jar-?\d+\s*L)/i);
      if (m) packVolume = m[1].replace(/\s+/g, ' ').toUpperCase().replace(/JAR/i, 'Jar');
    }
  }

  const skuFilter =
    filters?.skuId || packVolume
      ? {
          OR: [
            ...(filters?.skuId ? [{ skuId: filters.skuId }] : []),
            ...(packVolume
              ? [
                  { sku: { packVolume: { equals: packVolume, mode: 'insensitive' as const } } },
                  { sku: { packVolume: { equals: packVolume.toUpperCase(), mode: 'insensitive' as const } } },
                  { sku: { name: { contains: packVolume, mode: 'insensitive' as const } } },
                  { sku: { code: { contains: packVolume.replace(/\s+/g, '-'), mode: 'insensitive' as const } } },
                  { sku: { code: { contains: packVolume.replace(/\s+/g, ''), mode: 'insensitive' as const } } },
                ]
              : []),
          ],
        }
      : {};

  const plans = await prisma.productionPlan.findMany({
    where: {
      deletedAt: null,
      productionDate: { gte: start, lte: end },
      ...planScope(user),
      ...skuFilter,
      ...(filters?.brandId
        ? {
            OR: [
              { product: { brandId: filters.brandId, deletedAt: null } },
              // Brand name also used as product name in some catalog rows
              {
                product: {
                  deletedAt: null,
                  brand: { id: filters.brandId, deletedAt: null },
                },
              },
            ],
          }
        : {}),
    },
    include: {
      product: { include: { brand: true } },
      sku: true,
      productionEntries: { where: { deletedAt: null, status: { not: 'REJECTED' } } },
    },
    orderBy: { productionDate: 'asc' },
  });

  type Agg = {
    date: string;
    productId: string;
    product: string;
    productCode: string;
    brandId: string | null;
    brand: string;
    skuId: string | null;
    sku: string;
    plannedCases: number;
    actualCases: number;
  };

  const byProduct = new Map<string, Agg>();
  const bySku = new Map<string, Agg>();

  for (const plan of plans) {
    const actual = plan.productionEntries.reduce((s, e) => s + e.actualCases, 0);
    const brandName = plan.product.brand?.name || plan.product.name || 'Unassigned';
    const brandId = plan.product.brandId || null;
    const skuLabel = plan.sku.packVolume || plan.sku.name || plan.sku.code;
    const dateKey = toCalendarDate(plan.productionDate);

    const pKey = `${dateKey}::${plan.productId}`;
    const p = byProduct.get(pKey) ?? {
      date: dateKey,
      productId: plan.productId,
      product: plan.product.name,
      productCode: plan.product.code,
      brandId,
      brand: brandName,
      skuId: null,
      sku: '',
      plannedCases: 0,
      actualCases: 0,
    };
    p.plannedCases += plan.plannedCases;
    p.actualCases += actual;
    byProduct.set(pKey, p);

    // Aggregate by date + product + pack volume
    const packKey = (plan.sku.packVolume || plan.sku.code || plan.skuId).toUpperCase();
    const sKey = `${dateKey}::${plan.productId}::${packKey}`;
    const s = bySku.get(sKey) ?? {
      date: dateKey,
      productId: plan.productId,
      product: plan.product.name,
      productCode: plan.product.code,
      brandId,
      brand: brandName,
      skuId: plan.skuId,
      sku: skuLabel,
      plannedCases: 0,
      actualCases: 0,
    };
    s.plannedCases += plan.plannedCases;
    s.actualCases += actual;
    bySku.set(sKey, s);
  }

  const rows = [...byProduct.values()]
    .map((r) => {
      const variance = Number((r.actualCases - r.plannedCases).toFixed(2));
      return {
        date: r.date,
        productId: r.productId,
        product: r.product,
        productCode: r.productCode,
        brand: r.brand,
        brandId: r.brandId,
        plannedCases: Number(r.plannedCases.toFixed(2)),
        actualCases: Number(r.actualCases.toFixed(2)),
        variance,
        achievement: calcAchievement(r.plannedCases, r.actualCases),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.product.localeCompare(b.product));

  const skuRows = [...bySku.values()]
    .map((r) => {
      const variance = Number((r.actualCases - r.plannedCases).toFixed(2));
      return {
        date: r.date,
        productId: r.productId,
        product: r.product,
        brand: r.brand,
        brandId: r.brandId,
        skuId: r.skuId,
        sku: r.sku,
        plannedCases: Number(r.plannedCases.toFixed(2)),
        actualCases: Number(r.actualCases.toFixed(2)),
        variance,
        achievement: calcAchievement(r.plannedCases, r.actualCases),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.product.localeCompare(b.product) || a.sku.localeCompare(b.sku));

  const plannedCases = rows.reduce((s, r) => s + r.plannedCases, 0);
  const actualCases = rows.reduce((s, r) => s + r.actualCases, 0);
  const variance = Number((actualCases - plannedCases).toFixed(2));

  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    filters: {
      brandId: filters?.brandId || null,
      skuId: filters?.skuId || null,
      packVolume: packVolume || null,
    },
    totals: {
      plannedCases: Number(plannedCases.toFixed(2)),
      actualCases: Number(actualCases.toFixed(2)),
      variance,
      achievement: calcAchievement(plannedCases, actualCases),
      productCount: rows.length,
    },
    /** Clustered column chart: Product → Planned vs Actual (range total) */
    chart: (() => {
      const map = new Map<string, { product: string; planned: number; actual: number }>();
      for (const r of rows) {
        const cur = map.get(r.productId) ?? { product: r.product, planned: 0, actual: 0 };
        cur.planned += r.plannedCases;
        cur.actual += r.actualCases;
        map.set(r.productId, cur);
      }
      return [...map.values()]
        .map((r) => ({
          product: r.product,
          planned: Number(r.planned.toFixed(2)),
          actual: Number(r.actual.toFixed(2)),
          variance: Number((r.actual - r.planned).toFixed(2)),
        }))
        .sort((a, b) => a.product.localeCompare(b.product));
    })(),
    /** Table: Date | Product | Planned Cases | Actual Cases | Variance */
    rows,
    skuRows,
  };
}

export async function exportPlanVsActualExcel(
  user?: AuthUser,
  filters?: { from?: string; to?: string; brandId?: string; skuId?: string; packVolume?: string },
) {
  const data = await getPlanVsActualDashboard(user, filters);
  const tableRows = data.skuRows?.length ? data.skuRows : data.rows.map((r) => ({ ...r, sku: '—' }));

  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Nakshatra Beverages MES';
  const sheet = workbook.addWorksheet('Plan vs Actual');

  sheet.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Product', key: 'product', width: 18 },
    { header: 'SKU', key: 'sku', width: 12 },
    { header: 'Brand', key: 'brand', width: 16 },
    { header: 'Planned Cases', key: 'planned', width: 14 },
    { header: 'Actual Cases', key: 'actual', width: 14 },
    { header: 'Variance', key: 'variance', width: 12 },
    { header: 'Achievement %', key: 'achievement', width: 14 },
  ];

  sheet.getRow(1).font = { bold: true };

  for (const r of tableRows) {
    sheet.addRow({
      date: r.date,
      product: r.product,
      sku: r.sku || '—',
      brand: r.brand,
      planned: r.plannedCases,
      actual: r.actualCases,
      variance: r.variance,
      achievement: r.achievement,
    });
  }

  sheet.addRow({
    date: '',
    product: 'Total',
    sku: '',
    brand: '',
    planned: data.totals.plannedCases,
    actual: data.totals.actualCases,
    variance: data.totals.variance,
    achievement: data.totals.achievement,
  }).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Changeover Analysis — reads ChangeoverEntry directly (not only plan-linked). */
export async function getChangeoverAnalysis(
  user?: AuthUser,
  opts?: { from?: string; to?: string; lineId?: string },
) {
  const { start, end } = dateRange(opts?.from, opts?.to);

  const where: Prisma.ChangeoverEntryWhereInput = {
    deletedAt: null,
    ...(opts?.lineId ? { lineId: opts.lineId } : {}),
    OR: [
      { productionDate: { gte: start, lte: end } },
      { productionDate: null, startTime: { gte: start, lte: end } },
      { productionDate: null, startTime: null, createdAt: { gte: start, lte: end } },
    ],
  };

  if (user?.role === 'LINE_SUPERVISOR') {
    where.AND = [
      {
        OR: [
          { line: { supervisorId: user.id } },
          { plan: { supervisorId: user.id } },
          { plan: { line: { supervisorId: user.id } } },
        ],
      },
    ];
  } else if (user?.role === 'PRODUCTION_MANAGER' && user.plantId) {
    where.AND = [
      {
        OR: [{ line: { plantId: user.plantId } }, { plan: { plantId: user.plantId } }],
      },
    ];
  }

  const items = await prisma.changeoverEntry.findMany({
    where,
    include: {
      line: { select: { id: true, code: true, name: true } },
      changeoverType: { select: { id: true, name: true, standardMins: true } },
      fromProduct: { select: { id: true, name: true } },
      toProduct: { select: { id: true, name: true } },
      fromSku: { select: { id: true, code: true, name: true, packVolume: true } },
      toSku: { select: { id: true, code: true, name: true, packVolume: true } },
    },
    orderBy: [{ productionDate: 'asc' }, { startTime: 'asc' }, { createdAt: 'asc' }],
  });

  const dayMap = new Map<string, { count: number; actualMins: number; standardMins: number }>();
  const typeMap = new Map<string, { count: number; actualMins: number; standardMins: number }>();
  const lineMap = new Map<string, { count: number; actualMins: number }>();
  const kindMap = { PLANNED: { count: 0, actualMins: 0 }, UNPLANNED: { count: 0, actualMins: 0 } };

  let totalActual = 0;
  let totalStandard = 0;
  let overStandardCount = 0;

  for (const c of items) {
    const dateKey =
      (c.productionDate ? c.productionDate.toISOString().slice(0, 10) : null) ||
      (c.startTime ? c.startTime.toISOString().slice(0, 10) : null) ||
      c.createdAt.toISOString().slice(0, 10);

    const actual = Number(c.actualMins) || 0;
    const standard = Number(c.standardMins) || 0;
    totalActual += actual;
    totalStandard += standard;
    if (actual > standard && standard > 0) overStandardCount += 1;

    const day = dayMap.get(dateKey) ?? { count: 0, actualMins: 0, standardMins: 0 };
    day.count += 1;
    day.actualMins += actual;
    day.standardMins += standard;
    dayMap.set(dateKey, day);

    const typeName = c.changeoverType?.name || 'Other';
    const t = typeMap.get(typeName) ?? { count: 0, actualMins: 0, standardMins: 0 };
    t.count += 1;
    t.actualMins += actual;
    t.standardMins += standard;
    typeMap.set(typeName, t);

    const lineName = c.line?.code || c.line?.name || 'Unassigned';
    const l = lineMap.get(lineName) ?? { count: 0, actualMins: 0 };
    l.count += 1;
    l.actualMins += actual;
    lineMap.set(lineName, l);

    const kind = c.kind === 'UNPLANNED' ? 'UNPLANNED' : 'PLANNED';
    kindMap[kind].count += 1;
    kindMap[kind].actualMins += actual;
  }

  const count = items.length;
  const avgMins = count ? totalActual / count : 0;
  const varianceMins = totalActual - totalStandard;

  return {
    kpis: {
      totalChangeovers: count,
      totalActualMins: Number(totalActual.toFixed(1)),
      totalStandardMins: Number(totalStandard.toFixed(1)),
      avgMins: Number(avgMins.toFixed(1)),
      varianceMins: Number(varianceMins.toFixed(1)),
      overStandardCount,
      plannedCount: kindMap.PLANNED.count,
      unplannedCount: kindMap.UNPLANNED.count,
    },
    trend: [...dayMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        count: v.count,
        actualMins: Number(v.actualMins.toFixed(1)),
        standardMins: Number(v.standardMins.toFixed(1)),
      })),
    byType: [...typeMap.entries()]
      .map(([name, v]) => ({
        name,
        count: v.count,
        actualMins: Number(v.actualMins.toFixed(1)),
        standardMins: Number(v.standardMins.toFixed(1)),
      }))
      .sort((a, b) => b.actualMins - a.actualMins),
    byLine: [...lineMap.entries()]
      .map(([name, v]) => ({
        name,
        count: v.count,
        actualMins: Number(v.actualMins.toFixed(1)),
      }))
      .sort((a, b) => b.actualMins - a.actualMins),
    byKind: [
      { name: 'Planned', count: kindMap.PLANNED.count, actualMins: Number(kindMap.PLANNED.actualMins.toFixed(1)) },
      { name: 'Unplanned', count: kindMap.UNPLANNED.count, actualMins: Number(kindMap.UNPLANNED.actualMins.toFixed(1)) },
    ],
    rows: items.map((c) => ({
      id: c.id,
      date:
        (c.productionDate ? c.productionDate.toISOString().slice(0, 10) : null) ||
        (c.startTime ? c.startTime.toISOString().slice(0, 10) : null) ||
        c.createdAt.toISOString().slice(0, 10),
      line: c.line?.code || c.line?.name || '—',
      fromProduct: c.fromProduct?.name || '—',
      fromSku: c.fromSku?.packVolume || c.fromSku?.name || c.fromSku?.code || '—',
      toProduct: c.toProduct?.name || '—',
      toSku: c.toSku?.packVolume || c.toSku?.name || c.toSku?.code || '—',
      type: c.changeoverType?.name || '—',
      kind: c.kind,
      standardMins: c.standardMins,
      actualMins: c.actualMins,
      varianceMins: Number((Number(c.actualMins) - Number(c.standardMins)).toFixed(1)),
      reason: c.reason || '—',
    })),
  };
}

/** Downtime Analysis — same shape as Changeover Analysis. */
export async function getDowntimeAnalysis(
  user?: AuthUser,
  opts?: { from?: string; to?: string; lineId?: string },
) {
  const { start, end } = dateRange(opts?.from, opts?.to);

  const dateOr: Prisma.DowntimeEntryWhereInput[] = [
    { plan: { productionDate: { gte: start, lte: end }, ...(opts?.lineId ? { lineId: opts.lineId } : {}) } },
    {
      startTime: { gte: start, lte: end },
      ...(opts?.lineId ? { plan: { lineId: opts.lineId } } : {}),
    },
  ];

  const scoped: Prisma.DowntimeEntryWhereInput = {
    deletedAt: null,
    OR: dateOr,
  };

  if (user?.role === 'LINE_SUPERVISOR') {
    scoped.AND = [
      {
        OR: [
          { plan: { supervisorId: user.id } },
          { plan: { line: { supervisorId: user.id } } },
        ],
      },
    ];
  } else if (user?.role === 'PRODUCTION_MANAGER' && user.plantId) {
    scoped.AND = [{ plan: { plantId: user.plantId } }];
  }

  const items = await prisma.downtimeEntry.findMany({
    where: scoped,
    include: {
      plan: {
        select: {
          id: true,
          planNumber: true,
          productionDate: true,
          line: { select: { id: true, code: true, name: true } },
          shift: { select: { id: true, name: true } },
        },
      },
      machine: { select: { id: true, code: true, name: true } },
      category: { select: { id: true, name: true } },
      reason: { select: { id: true, name: true } },
    },
    orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
  });

  const dayMap = new Map<string, { count: number; minutes: number }>();
  const categoryMap = new Map<string, { count: number; minutes: number }>();
  const machineMap = new Map<string, { count: number; minutes: number }>();
  const lineMap = new Map<string, { count: number; minutes: number }>();
  const reasonMap = new Map<string, { count: number; minutes: number }>();

  let totalMins = 0;

  for (const e of items) {
    const mins = Number(e.durationMins) || 0;
    totalMins += mins;
    const dateKey =
      (e.plan?.productionDate ? e.plan.productionDate.toISOString().slice(0, 10) : null) ||
      e.startTime.toISOString().slice(0, 10);

    const day = dayMap.get(dateKey) ?? { count: 0, minutes: 0 };
    day.count += 1;
    day.minutes += mins;
    dayMap.set(dateKey, day);

    const cat = e.category?.name || 'Other';
    const c = categoryMap.get(cat) ?? { count: 0, minutes: 0 };
    c.count += 1;
    c.minutes += mins;
    categoryMap.set(cat, c);

    const mach = e.machine?.code || e.machine?.name || 'Unassigned';
    const m = machineMap.get(mach) ?? { count: 0, minutes: 0 };
    m.count += 1;
    m.minutes += mins;
    machineMap.set(mach, m);

    const lineName = e.plan?.line?.code || e.plan?.line?.name || 'Unassigned';
    const l = lineMap.get(lineName) ?? { count: 0, minutes: 0 };
    l.count += 1;
    l.minutes += mins;
    lineMap.set(lineName, l);

    const reasonName = e.reason?.name || 'Other';
    const r = reasonMap.get(reasonName) ?? { count: 0, minutes: 0 };
    r.count += 1;
    r.minutes += mins;
    reasonMap.set(reasonName, r);
  }

  const count = items.length;
  const avgMins = count ? totalMins / count : 0;
  const topCategory = [...categoryMap.entries()].sort((a, b) => b[1].minutes - a[1].minutes)[0];
  const topMachine = [...machineMap.entries()].sort((a, b) => b[1].minutes - a[1].minutes)[0];

  return {
    kpis: {
      totalEvents: count,
      totalMins: Number(totalMins.toFixed(1)),
      avgMins: Number(avgMins.toFixed(1)),
      categoryCount: categoryMap.size,
      machineCount: [...machineMap.keys()].filter((k) => k !== 'Unassigned').length,
      topCategory: topCategory ? topCategory[0] : '—',
      topCategoryMins: topCategory ? Number(topCategory[1].minutes.toFixed(1)) : 0,
      topMachine: topMachine ? topMachine[0] : '—',
      topMachineMins: topMachine ? Number(topMachine[1].minutes.toFixed(1)) : 0,
    },
    trend: [...dayMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        count: v.count,
        minutes: Number(v.minutes.toFixed(1)),
      })),
    byCategory: [...categoryMap.entries()]
      .map(([name, v]) => ({
        name,
        count: v.count,
        minutes: Number(v.minutes.toFixed(1)),
      }))
      .sort((a, b) => b.minutes - a.minutes),
    byMachine: [...machineMap.entries()]
      .map(([name, v]) => ({
        name,
        count: v.count,
        minutes: Number(v.minutes.toFixed(1)),
      }))
      .sort((a, b) => b.minutes - a.minutes),
    byLine: [...lineMap.entries()]
      .map(([name, v]) => ({
        name,
        count: v.count,
        minutes: Number(v.minutes.toFixed(1)),
      }))
      .sort((a, b) => b.minutes - a.minutes),
    byReason: [...reasonMap.entries()]
      .map(([name, v]) => ({
        name,
        count: v.count,
        minutes: Number(v.minutes.toFixed(1)),
      }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 12),
    rows: items.map((e) => ({
      id: e.id,
      date:
        (e.plan?.productionDate ? e.plan.productionDate.toISOString().slice(0, 10) : null) ||
        e.startTime.toISOString().slice(0, 10),
      planNumber: e.plan?.planNumber || '—',
      line: e.plan?.line?.code || e.plan?.line?.name || '—',
      shift: e.plan?.shift?.name || '—',
      machine: e.machine?.code || e.machine?.name || '—',
      category: e.category?.name || '—',
      reason: e.reason?.name || '—',
      durationMins: Number(e.durationMins) || 0,
      actionTaken: e.actionTaken || '—',
      remarks: e.remarks || '—',
    })),
  };
}

/** Manpower Analysis — shift-wise labour KPIs (cases/operator, productivity, utilization, OT, idle). */
export async function getManpowerAnalysis(
  user?: AuthUser,
  opts?: { from?: string; to?: string; lineId?: string; shiftId?: string },
) {
  const { start, end } = dateRange(opts?.from, opts?.to);

  const planWhere: Prisma.ProductionPlanWhereInput = {
    deletedAt: null,
    productionDate: { gte: start, lte: end },
    ...planScope(user),
    ...(opts?.lineId ? { lineId: opts.lineId } : {}),
    ...(opts?.shiftId ? { shiftId: opts.shiftId } : {}),
  };

  const plans = await prisma.productionPlan.findMany({
    where: planWhere,
    select: {
      id: true,
      productionDate: true,
      plannedManpower: true,
      plannedOperatingMins: true,
      plannedCases: true,
      lineId: true,
      shiftId: true,
      line: { select: { id: true, code: true, name: true } },
      shift: { select: { id: true, name: true } },
      sku: { select: { packSize: true } },
      productionEntries: {
        where: { deletedAt: null, status: { not: 'REJECTED' } },
        select: { actualCases: true, plannedCases: true },
      },
      downtimeEntries: {
        where: { deletedAt: null },
        select: {
          durationMins: true,
          category: { select: { name: true } },
        },
      },
      manpowerEntries: {
        where: { deletedAt: null },
        orderBy: { recordedAt: 'desc' },
        take: 1,
        select: {
          headcount: true,
          operators: true,
          helpers: true,
          overtimeMins: true,
        },
      },
    },
    orderBy: [{ productionDate: 'asc' }, { shift: { name: 'asc' } }],
  });

  type ShiftBucket = {
    date: string;
    shiftId: string;
    shift: string;
    lineId: string;
    line: string;
    plannedHeadcount: number;
    present: number;
    operators: number;
    helpers: number;
    plannedCases: number;
    actualCases: number;
    bottles: number;
    availableHours: number;
    workingHours: number;
    labourHours: number;
    overtimeHours: number;
    idleLabourHours: number;
    manpowerLossCases: number;
    hasManpower: boolean;
  };

  const shiftDayMap = new Map<string, ShiftBucket>();

  for (const plan of plans) {
    const dateKey = toCalendarDate(plan.productionDate);
    const shiftName = plan.shift?.name || 'Unassigned';
    const lineName = plan.line?.code || plan.line?.name || 'Unassigned';
    const key = `${dateKey}|${plan.shiftId}|${plan.lineId}`;

    const mp = plan.manpowerEntries[0];
    const plannedHeadcount = Number(plan.plannedManpower) || 0;
    const present = mp ? Number(mp.headcount) || 0 : 0;
    const operators = mp ? Number(mp.operators) || present : 0;
    const helpers = mp ? Number(mp.helpers) || 0 : 0;
    const overtimeMins = mp ? Number(mp.overtimeMins) || 0 : 0;

    const actualCases = plan.productionEntries.reduce((s, e) => s + Number(e.actualCases || 0), 0);
    const entryPlanned = plan.productionEntries.reduce((s, e) => s + Number(e.plannedCases || 0), 0);
    const plannedCases = entryPlanned > 0 ? entryPlanned : Number(plan.plannedCases) || 0;
    const packSize = Number(plan.sku?.packSize) > 0 ? Number(plan.sku?.packSize) : 24;
    const bottles = actualCases * packSize;

    const availableMins = Number(plan.plannedOperatingMins) || 0;
    const downtimeMins = plan.downtimeEntries.reduce((s, e) => s + Number(e.durationMins || 0), 0);
    // Idle labour: waiting + breakdown style downtime × present headcount
    const idleCategoryMins = plan.downtimeEntries
      .filter((d) => {
        const n = (d.category?.name || '').toLowerCase();
        return (
          n.includes('manpower') ||
          n.includes('wait') ||
          n.includes('mechanical') ||
          n.includes('electrical') ||
          n.includes('breakdown') ||
          n.includes('idle')
        );
      })
      .reduce((s, e) => s + Number(e.durationMins || 0), 0);
    const idleBaseMins = idleCategoryMins > 0 ? idleCategoryMins : downtimeMins;
    const runMins = Math.max(0, availableMins - downtimeMins);

    const availableHours = (plannedHeadcount * availableMins) / 60;
    const workingHours = (present * runMins) / 60;
    const labourHours = (operators * runMins) / 60;
    const overtimeHours = overtimeMins / 60;
    const idleLabourHours = present > 0 ? (idleBaseMins * present) / 60 : idleBaseMins / 60;

    // Production loss attributable to staffing shortage
    const manpowerLossCases =
      plannedHeadcount > 0 && present < plannedHeadcount
        ? Number((plannedCases * (1 - present / plannedHeadcount)).toFixed(1))
        : 0;

    const bucket =
      shiftDayMap.get(key) ??
      ({
        date: dateKey,
        shiftId: plan.shiftId,
        shift: shiftName,
        lineId: plan.lineId,
        line: lineName,
        plannedHeadcount: 0,
        present: 0,
        operators: 0,
        helpers: 0,
        plannedCases: 0,
        actualCases: 0,
        bottles: 0,
        availableHours: 0,
        workingHours: 0,
        labourHours: 0,
        overtimeHours: 0,
        idleLabourHours: 0,
        manpowerLossCases: 0,
        hasManpower: false,
      } satisfies ShiftBucket);

    bucket.plannedHeadcount += plannedHeadcount;
    bucket.present += present;
    bucket.operators += operators;
    bucket.helpers += helpers;
    bucket.plannedCases += plannedCases;
    bucket.actualCases += actualCases;
    bucket.bottles += bottles;
    bucket.availableHours += availableHours;
    bucket.workingHours += workingHours;
    bucket.labourHours += labourHours;
    bucket.overtimeHours += overtimeHours;
    bucket.idleLabourHours += idleLabourHours;
    bucket.manpowerLossCases += manpowerLossCases;
    if (mp) bucket.hasManpower = true;
    shiftDayMap.set(key, bucket);
  }

  const rows = [...shiftDayMap.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.shift.localeCompare(b.shift) || a.line.localeCompare(b.line),
  );

  const sum = rows.reduce(
    (acc, r) => {
      acc.plannedHeadcount += r.plannedHeadcount;
      acc.present += r.present;
      acc.operators += r.operators;
      acc.helpers += r.helpers;
      acc.plannedCases += r.plannedCases;
      acc.actualCases += r.actualCases;
      acc.bottles += r.bottles;
      acc.availableHours += r.availableHours;
      acc.workingHours += r.workingHours;
      acc.labourHours += r.labourHours;
      acc.overtimeHours += r.overtimeHours;
      acc.idleLabourHours += r.idleLabourHours;
      acc.manpowerLossCases += r.manpowerLossCases;
      return acc;
    },
    {
      plannedHeadcount: 0,
      present: 0,
      operators: 0,
      helpers: 0,
      plannedCases: 0,
      actualCases: 0,
      bottles: 0,
      availableHours: 0,
      workingHours: 0,
      labourHours: 0,
      overtimeHours: 0,
      idleLabourHours: 0,
      manpowerLossCases: 0,
    },
  );

  const round1 = (n: number) => Number(n.toFixed(1));
  const casesPerOperator = sum.operators > 0 ? round1(sum.actualCases / sum.operators) : 0;
  const bottlesPerOperator = sum.operators > 0 ? round1(sum.bottles / sum.operators) : 0;
  const labourProductivity = sum.labourHours > 0 ? round1(sum.actualCases / sum.labourHours) : 0;
  const labourUtilization =
    sum.availableHours > 0 ? round1((sum.workingHours / sum.availableHours) * 100) : 0;
  const manpowerAvailability =
    sum.plannedHeadcount > 0 ? round1((sum.present / sum.plannedHeadcount) * 100) : 0;

  const dayMap = new Map<
    string,
    { actualCases: number; operators: number; labourHours: number; present: number; planned: number; idle: number; ot: number }
  >();
  const shiftMap = new Map<
    string,
    { actualCases: number; operators: number; labourHours: number; present: number; planned: number; loss: number }
  >();

  for (const r of rows) {
    const day = dayMap.get(r.date) ?? {
      actualCases: 0,
      operators: 0,
      labourHours: 0,
      present: 0,
      planned: 0,
      idle: 0,
      ot: 0,
    };
    day.actualCases += r.actualCases;
    day.operators += r.operators;
    day.labourHours += r.labourHours;
    day.present += r.present;
    day.planned += r.plannedHeadcount;
    day.idle += r.idleLabourHours;
    day.ot += r.overtimeHours;
    dayMap.set(r.date, day);

    const sh = shiftMap.get(r.shift) ?? {
      actualCases: 0,
      operators: 0,
      labourHours: 0,
      present: 0,
      planned: 0,
      loss: 0,
    };
    sh.actualCases += r.actualCases;
    sh.operators += r.operators;
    sh.labourHours += r.labourHours;
    sh.present += r.present;
    sh.planned += r.plannedHeadcount;
    sh.loss += r.manpowerLossCases;
    shiftMap.set(r.shift, sh);
  }

  const trend = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      casesPerOperator: v.operators > 0 ? round1(v.actualCases / v.operators) : 0,
      labourProductivity: v.labourHours > 0 ? round1(v.actualCases / v.labourHours) : 0,
      manpowerAvailability: v.planned > 0 ? round1((v.present / v.planned) * 100) : 0,
      idleLabourHours: round1(v.idle),
      overtimeHours: round1(v.ot),
    }));

  const byShift = [...shiftMap.entries()]
    .map(([name, v]) => ({
      name,
      casesPerOperator: v.operators > 0 ? round1(v.actualCases / v.operators) : 0,
      labourProductivity: v.labourHours > 0 ? round1(v.actualCases / v.labourHours) : 0,
      manpowerAvailability: v.planned > 0 ? round1((v.present / v.planned) * 100) : 0,
      manpowerLossCases: round1(v.loss),
      present: v.present,
      planned: v.planned,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    kpis: {
      casesPerOperator,
      bottlesPerOperator,
      labourProductivity,
      labourUtilization,
      manpowerAvailability,
      manpowerLossCases: round1(sum.manpowerLossCases),
      overtimeHours: round1(sum.overtimeHours),
      idleLabourHours: round1(sum.idleLabourHours),
      // supporting totals
      actualCases: round1(sum.actualCases),
      bottles: round1(sum.bottles),
      operators: sum.operators,
      present: sum.present,
      plannedHeadcount: sum.plannedHeadcount,
      labourHours: round1(sum.labourHours),
      availableHours: round1(sum.availableHours),
      workingHours: round1(sum.workingHours),
      shiftCount: rows.length,
    },
    formulas: {
      casesPerOperator: 'Total Cases ÷ Operators',
      bottlesPerOperator: 'Bottles Produced ÷ Operators',
      labourProductivity: 'Actual Production ÷ Labour Hours',
      labourUtilization: 'Actual Working Hours ÷ Available Hours × 100',
      manpowerAvailability: 'Present ÷ Planned × 100',
      manpowerLossCases: 'Target × (1 − Present/Planned) when short-staffed',
      overtimeHours: 'Total OT Hours',
      idleLabourHours: '(Waiting + Breakdown mins) × Present ÷ 60',
    },
    trend,
    byShift,
    rows: rows.map((r) => ({
      id: `${r.date}-${r.shiftId}-${r.lineId}`,
      date: r.date,
      shift: r.shift,
      line: r.line,
      planned: r.plannedHeadcount,
      present: r.hasManpower ? r.present : null,
      operators: r.hasManpower ? r.operators : null,
      helpers: r.hasManpower ? r.helpers : null,
      actualCases: round1(r.actualCases),
      casesPerOperator: r.operators > 0 ? round1(r.actualCases / r.operators) : null,
      bottlesPerOperator: r.operators > 0 ? round1(r.bottles / r.operators) : null,
      labourProductivity: r.labourHours > 0 ? round1(r.actualCases / r.labourHours) : null,
      labourUtilization: r.availableHours > 0 ? round1((r.workingHours / r.availableHours) * 100) : null,
      manpowerAvailability:
        r.plannedHeadcount > 0 && r.hasManpower ? round1((r.present / r.plannedHeadcount) * 100) : null,
      manpowerLossCases: round1(r.manpowerLossCases),
      overtimeHours: round1(r.overtimeHours),
      idleLabourHours: round1(r.idleLabourHours),
    })),
  };
}



