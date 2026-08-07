import { prisma } from '../config/prisma.js';
import type { AuthUser } from '../middleware/auth.js';
import ExcelJS from 'exceljs';
import {
  calcAchievement,
  calcCapacityUtilization,
  calcLoss,
  computeOeeMetrics,
  isPlannedProductionLossCategory,
  splitDowntimeMins,
} from '../utils/oee.js';

function planScope(user?: AuthUser) {
  if (!user) return {};
  if (user.role === 'LINE_SUPERVISOR') {
    return { OR: [{ supervisorId: user.id }, { line: { supervisorId: user.id } }] };
  }
  if (user.role === 'PRODUCTION_MANAGER' && user.plantId) {
    return { plantId: user.plantId };
  }
  return {};
}

function dayBounds(date?: string, from?: string, to?: string) {
  if (date) {
    const d = date.slice(0, 10);
    return {
      start: new Date(`${d}T00:00:00.000Z`),
      end: new Date(`${d}T23:59:59.999Z`),
    };
  }
  const start = from
    ? new Date(`${from.slice(0, 10)}T00:00:00.000Z`)
    : new Date(new Date().setDate(new Date().getDate() - 7));
  const end = to ? new Date(`${to.slice(0, 10)}T23:59:59.999Z`) : new Date();
  if (!to) end.setHours(23, 59, 59, 999);
  return { start, end };
}

type LineAgg = {
  lineId: string;
  lineCode: string;
  lineName: string;
  plantId: string;
  plantName: string;
  capacityCph: number | null;
  planCount: number;
  plannedCases: number;
  actualCases: number;
  goodCases: number;
  rejectCases: number;
  downtimeMins: number;
  plannedProductionTimeMins: number;
  runTimeMins: number;
  wAvail: number;
  wPerf: number;
  wQual: number;
  wOee: number;
  weightSum: number;
};

/**
 * Line-wise production & OEE overview (analysis formulas):
 * Availability / Performance / Quality / OEE = A × P × Q
 * Aggregated per production line for the selected day (or range).
 */
export async function getLineWiseOverview(
  filters: { date?: string; from?: string; to?: string; plantId?: string },
  user?: AuthUser,
) {
  const { start, end } = dayBounds(filters.date, filters.from, filters.to);
  const reportDate = filters.date?.slice(0, 10) || start.toISOString().slice(0, 10);

  const plans = await prisma.productionPlan.findMany({
    where: {
      deletedAt: null,
      productionDate: { gte: start, lte: end },
      ...(filters.plantId ? { plantId: filters.plantId } : {}),
      ...planScope(user),
    },
    include: {
      plant: true,
      line: true,
      shift: true,
      product: true,
      productionEntries: { where: { deletedAt: null, status: { not: 'REJECTED' } } },
      downtimeEntries: { where: { deletedAt: null }, include: { category: true } },
    },
    orderBy: [{ productionDate: 'asc' }, { createdAt: 'asc' }],
  });

  const lineMap = new Map<string, LineAgg>();
  const dayTrend = new Map<
    string,
    { date: string; downtime: number; planned: number; actual: number; wOee: number; weight: number }
  >();

  for (const plan of plans) {
    const key = plan.lineId;
    if (!lineMap.has(key)) {
      lineMap.set(key, {
        lineId: plan.line.id,
        lineCode: plan.line.code,
        lineName: plan.line.name,
        plantId: plan.plant.id,
        plantName: plan.plant.name,
        capacityCph: plan.line.capacityCph,
        planCount: 0,
        plannedCases: 0,
        actualCases: 0,
        goodCases: 0,
        rejectCases: 0,
        downtimeMins: 0,
        plannedProductionTimeMins: 0,
        runTimeMins: 0,
        wAvail: 0,
        wPerf: 0,
        wQual: 0,
        wOee: 0,
        weightSum: 0,
      });
    }

    const row = lineMap.get(key)!;
    const actual = plan.productionEntries.reduce((s, e) => s + e.actualCases, 0);
    const good = plan.productionEntries.reduce((s, e) => s + e.goodCases, 0);
    const reject = plan.productionEntries.reduce((s, e) => s + e.rejectCases, 0);
    const { plannedLossMins, unplannedDowntimeMins, totalDowntimeMins } = splitDowntimeMins(
      plan.downtimeEntries,
    );
    const totalCount = actual || good + reject;
    const goodCount = good > 0 ? good : totalCount;

    const metrics = computeOeeMetrics({
      plannedProductionTimeMins: plan.plannedOperatingMins,
      downtimeMins: totalDowntimeMins,
      plannedLossMins,
      unplannedDowntimeMins,
      plannedCount: plan.plannedCases,
      totalCount,
      goodCount,
    });

    const weight = Math.max(0, metrics.plannedProductionTimeMins) || 0;
    row.planCount += 1;
    row.plannedCases += plan.plannedCases;
    row.actualCases += actual;
    row.goodCases += good;
    row.rejectCases += reject;
    row.downtimeMins += unplannedDowntimeMins;
    row.plannedProductionTimeMins += metrics.plannedProductionTimeMins;
    row.runTimeMins += metrics.runTimeMins;
    if (weight > 0) {
      row.wAvail += metrics.availability * weight;
      row.wPerf += metrics.performance * weight;
      row.wQual += metrics.quality * weight;
      row.wOee += metrics.oee * weight;
      row.weightSum += weight;
    }

    const dateKey = toDateKey(plan.productionDate);
    const day = dayTrend.get(dateKey) ?? {
      date: dateKey,
      downtime: 0,
      planned: 0,
      actual: 0,
      wOee: 0,
      weight: 0,
    };
    day.downtime += unplannedDowntimeMins;
    day.planned += plan.plannedCases;
    day.actual += actual;
    if (weight > 0) {
      day.wOee += metrics.oee * weight;
      day.weight += weight;
    }
    dayTrend.set(dateKey, day);
  }

  const lines = [...lineMap.values()]
    .map((row) => {
      const availability = row.weightSum ? Number((row.wAvail / row.weightSum).toFixed(2)) : 0;
      const performance = row.weightSum ? Number((row.wPerf / row.weightSum).toFixed(2)) : 0;
      const quality = row.weightSum ? Number((row.wQual / row.weightSum).toFixed(2)) : 0;
      const oeeFromComponents = Number(
        (((availability / 100) * (performance / 100) * (quality / 100)) * 100).toFixed(2),
      );
      const oeeWeighted = row.weightSum ? Number((row.wOee / row.weightSum).toFixed(2)) : 0;
      const oee = oeeFromComponents || oeeWeighted;
      const achievement = calcAchievement(row.plannedCases, row.actualCases);
      const productionLoss = calcLoss(row.plannedCases, row.actualCases);
      const capacityUtilization = calcCapacityUtilization(row.actualCases, row.plannedCases);

      let status: 'Running' | 'Idle' | 'Down' | 'Completed' = 'Idle';
      if (row.actualCases >= row.plannedCases && row.plannedCases > 0) status = 'Completed';
      else if (row.downtimeMins >= 30 && row.actualCases === 0) status = 'Down';
      else if (row.actualCases > 0 || row.planCount > 0) status = 'Running';

      return {
        lineId: row.lineId,
        lineCode: row.lineCode,
        lineName: row.lineName,
        plantName: row.plantName,
        capacityCph: row.capacityCph,
        status,
        planCount: row.planCount,
        plannedCases: row.plannedCases,
        actualCases: row.actualCases,
        goodCases: row.goodCases,
        rejectCases: row.rejectCases,
        productionLoss,
        achievement,
        capacityUtilization,
        downtimeMins: Number(row.downtimeMins.toFixed(2)),
        plannedProductionTimeMins: Number(row.plannedProductionTimeMins.toFixed(2)),
        runTimeMins: Number(row.runTimeMins.toFixed(2)),
        availability,
        performance,
        quality,
        oee,
      };
    })
    .sort((a, b) => a.lineName.localeCompare(b.lineName));

  // Also list active lines with no plans so overview shows all lines
  const knownLines = await prisma.productionLine.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      ...(filters.plantId ? { plantId: filters.plantId } : {}),
      ...(user?.role === 'PRODUCTION_MANAGER' && user.plantId ? { plantId: user.plantId } : {}),
      ...(user?.role === 'LINE_SUPERVISOR'
        ? { OR: [{ supervisorId: user.id }, { id: { in: lines.map((l) => l.lineId) } }] }
        : {}),
    },
    include: { plant: true },
    orderBy: { name: 'asc' },
  });

  const present = new Set(lines.map((l) => l.lineId));
  for (const line of knownLines) {
    if (present.has(line.id)) continue;
    lines.push({
      lineId: line.id,
      lineCode: line.code,
      lineName: line.name,
      plantName: line.plant.name,
      capacityCph: line.capacityCph,
      status: 'Idle',
      planCount: 0,
      plannedCases: 0,
      actualCases: 0,
      goodCases: 0,
      rejectCases: 0,
      productionLoss: 0,
      achievement: 0,
      capacityUtilization: 0,
      downtimeMins: 0,
      plannedProductionTimeMins: 0,
      runTimeMins: 0,
      availability: 0,
      performance: 0,
      quality: 0,
      oee: 0,
    });
  }
  lines.sort((a, b) => a.lineName.localeCompare(b.lineName));

  const totals = {
    lineCount: lines.length,
    activeLines: lines.filter((l) => l.planCount > 0).length,
    plannedCases: lines.reduce((s, l) => s + l.plannedCases, 0),
    actualCases: lines.reduce((s, l) => s + l.actualCases, 0),
    goodCases: lines.reduce((s, l) => s + l.goodCases, 0),
    rejectCases: lines.reduce((s, l) => s + l.rejectCases, 0),
    downtimeMins: Number(lines.reduce((s, l) => s + l.downtimeMins, 0).toFixed(2)),
    plannedProductionTimeMins: Number(
      lines.reduce((s, l) => s + l.plannedProductionTimeMins, 0).toFixed(2),
    ),
    runTimeMins: Number(lines.reduce((s, l) => s + l.runTimeMins, 0).toFixed(2)),
  };

  // Plant-level weighted OEE from lines that have plans
  const active = lines.filter((l) => l.planCount > 0 && l.plannedProductionTimeMins > 0);
  const tw = active.reduce((s, l) => s + l.plannedProductionTimeMins, 0);
  const availability = tw
    ? Number((active.reduce((s, l) => s + l.availability * l.plannedProductionTimeMins, 0) / tw).toFixed(2))
    : 0;
  const performance = tw
    ? Number((active.reduce((s, l) => s + l.performance * l.plannedProductionTimeMins, 0) / tw).toFixed(2))
    : 0;
  const quality = tw
    ? Number((active.reduce((s, l) => s + l.quality * l.plannedProductionTimeMins, 0) / tw).toFixed(2))
    : 0;
  const oee = Number((((availability / 100) * (performance / 100) * (quality / 100)) * 100).toFixed(2));

  const downtimeTrend = [...dayTrend.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      date: d.date,
      downtime: Number(d.downtime.toFixed(2)),
      planned: d.planned,
      actual: d.actual,
      oee: d.weight ? Number((d.wOee / d.weight).toFixed(2)) : 0,
    }));

  const weekBuckets = new Map<
    1 | 2 | 3 | 4,
    { downtime: number; planned: number; actual: number; wOee: number; weight: number }
  >();
  for (const w of [1, 2, 3, 4] as const) {
    weekBuckets.set(w, { downtime: 0, planned: 0, actual: 0, wOee: 0, weight: 0 });
  }
  for (const d of dayTrend.values()) {
    const w = weekOfMonth(d.date);
    const b = weekBuckets.get(w)!;
    b.downtime += d.downtime;
    b.planned += d.planned;
    b.actual += d.actual;
    b.wOee += d.wOee;
    b.weight += d.weight;
  }
  const weeklyTrend = ([1, 2, 3, 4] as const).map((w) => {
    const b = weekBuckets.get(w)!;
    return {
      week: weekLabel(w),
      downtime: Number(b.downtime.toFixed(2)),
      planned: b.planned,
      actual: b.actual,
      oee: b.weight ? Number((b.wOee / b.weight).toFixed(2)) : 0,
    };
  });

  return {
    reportDate,
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    formula: {
      availability: 'Operating Time ÷ Planned Production Time × 100%',
      performance: '(Ideal Cycle Time × Total Count) ÷ Run Time × 100%',
      quality: 'Good Count ÷ Total Count × 100%',
      oee: 'Availability × Performance × Quality',
    },
    totals: {
      ...totals,
      achievement: calcAchievement(totals.plannedCases, totals.actualCases),
      productionLoss: calcLoss(totals.plannedCases, totals.actualCases),
      capacityUtilization: calcCapacityUtilization(totals.actualCases, totals.plannedCases),
      availability,
      performance,
      quality,
      oee,
    },
    lines,
    charts: {
      oeeByLine: lines.map((l) => ({
        line: l.lineCode || l.lineName,
        oee: l.oee,
        availability: l.availability,
        performance: l.performance,
        quality: l.quality,
      })),
      planVsActual: lines.map((l) => ({
        line: l.lineCode || l.lineName,
        planned: l.plannedCases,
        actual: l.actualCases,
      })),
      downtimeByLine: lines.map((l) => ({
        line: l.lineCode || l.lineName,
        downtime: l.downtimeMins,
      })),
      downtimeTrend,
      weeklyTrend,
    },
  };
}

function toDateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

type DayLineAgg = {
  date: string;
  lineId: string;
  lineCode: string;
  lineName: string;
  plantName: string;
  scheduledMins: number;
  plannedLossMins: number;
  downtimeMins: number;
  targetCases: number;
  actualCases: number;
  goodCases: number;
  rejectCases: number;
};

/**
 * Day-wise × line OEE sheet:
 * Date | Line | Planned Production Time | Downtime | Operating Time |
 * Target Cases | Actual Cases | Availability % | Performance % | Quality %
 *
 * Planned Production Time = Scheduled − Planned Production Loss
 */
export async function getDayWiseOee(
  filters: { from?: string; to?: string; plantId?: string; lineId?: string },
  user?: AuthUser,
) {
  const { start, end } = dayBounds(undefined, filters.from, filters.to);

  const plans = await prisma.productionPlan.findMany({
    where: {
      deletedAt: null,
      productionDate: { gte: start, lte: end },
      ...(filters.plantId ? { plantId: filters.plantId } : {}),
      ...(filters.lineId ? { lineId: filters.lineId } : {}),
      ...planScope(user),
    },
    include: {
      plant: true,
      line: true,
      productionEntries: { where: { deletedAt: null, status: { not: 'REJECTED' } } },
      downtimeEntries: { where: { deletedAt: null }, include: { category: true } },
    },
    orderBy: [{ productionDate: 'asc' }, { createdAt: 'asc' }],
  });

  const map = new Map<string, DayLineAgg>();

  for (const plan of plans) {
    const date = toDateKey(plan.productionDate);
    const key = `${date}|${plan.lineId}`;
    if (!map.has(key)) {
      map.set(key, {
        date,
        lineId: plan.line.id,
        lineCode: plan.line.code,
        lineName: plan.line.name,
        plantName: plan.plant.name,
        scheduledMins: 0,
        plannedLossMins: 0,
        downtimeMins: 0,
        targetCases: 0,
        actualCases: 0,
        goodCases: 0,
        rejectCases: 0,
      });
    }

    const row = map.get(key)!;
    const actual = plan.productionEntries.reduce((s, e) => s + e.actualCases, 0);
    const good = plan.productionEntries.reduce((s, e) => s + e.goodCases, 0);
    const reject = plan.productionEntries.reduce((s, e) => s + e.rejectCases, 0);
    const split = splitDowntimeMins(plan.downtimeEntries);

    row.scheduledMins += plan.plannedOperatingMins || 0;
    row.plannedLossMins += split.plannedLossMins;
    row.downtimeMins += split.unplannedDowntimeMins;
    row.targetCases += plan.plannedCases || 0;
    row.actualCases += actual;
    row.goodCases += good;
    row.rejectCases += reject;
  }

  const rows = [...map.values()]
    .map((row) => {
      const totalCount = row.actualCases || row.goodCases + row.rejectCases;
      const goodCount = row.goodCases > 0 ? row.goodCases : totalCount;
      const metrics = computeOeeMetrics({
        plannedProductionTimeMins: row.scheduledMins,
        downtimeMins: row.downtimeMins + row.plannedLossMins,
        plannedLossMins: row.plannedLossMins,
        unplannedDowntimeMins: row.downtimeMins,
        plannedCount: row.targetCases,
        totalCount,
        goodCount,
      });

      return {
        date: row.date,
        lineId: row.lineId,
        lineCode: row.lineCode,
        lineName: row.lineName,
        plantName: row.plantName,
        plannedProductionTimeMins: Number(metrics.plannedProductionTimeMins.toFixed(2)),
        downtimeMins: Number(metrics.downtimeMins.toFixed(2)),
        operatingTimeMins: Number(metrics.runTimeMins.toFixed(2)),
        targetCases: row.targetCases,
        actualCases: row.actualCases,
        availability: metrics.availability,
        performance: metrics.performance,
        quality: metrics.quality,
        oee: metrics.oee,
      };
    })
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.lineName.localeCompare(b.lineName);
    });

  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    rowCount: rows.length,
    rows,
  };
}

export async function exportDayWiseOeeExcel(
  filters: { from?: string; to?: string; plantId?: string; lineId?: string },
  user?: AuthUser,
) {
  const data = await getDayWiseOee(filters, user);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Nakshatra Beverages MES';
  const sheet = workbook.addWorksheet('Day-wise OEE');

  sheet.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Line', key: 'line', width: 18 },
    { header: 'Line Name', key: 'lineName', width: 22 },
    { header: 'Planned Production Time (Min)', key: 'plannedTime', width: 28 },
    { header: 'Downtime (Min)', key: 'downtime', width: 16 },
    { header: 'Operating Time (Min)', key: 'operatingTime', width: 20 },
    { header: 'Target Cases', key: 'target', width: 14 },
    { header: 'Actual Cases', key: 'actual', width: 14 },
    { header: 'Availability %', key: 'availability', width: 14 },
    { header: 'Performance %', key: 'performance', width: 14 },
    { header: 'Quality %', key: 'quality', width: 12 },
    { header: 'OEE %', key: 'oee', width: 12 },
  ];

  sheet.getRow(1).font = { bold: true };

  for (const r of data.rows) {
    sheet.addRow({
      date: r.date,
      line: r.lineCode || r.lineName,
      lineName: r.lineName,
      plannedTime: Math.round(r.plannedProductionTimeMins),
      downtime: Math.round(r.downtimeMins),
      operatingTime: Math.round(r.operatingTimeMins),
      target: r.targetCases,
      actual: r.actualCases,
      availability: r.availability,
      performance: r.performance,
      quality: r.quality,
      oee: r.oee,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Calendar week-of-month: 1–7 → 1, 8–14 → 2, 15–21 → 3, 22–end → 4 */
export function weekOfMonth(dateYmd: string): 1 | 2 | 3 | 4 {
  const day = Number(dateYmd.slice(8, 10));
  if (day <= 7) return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  return 4;
}

export function weekLabel(week: 1 | 2 | 3 | 4) {
  return `Week-${String(week).padStart(2, '0')}`;
}

function monthBounds(month: string) {
  const m = month.slice(0, 7);
  const [y, mo] = m.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return {
    month: m,
    start: new Date(`${m}-01T00:00:00.000Z`),
    end: new Date(`${m}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`),
    lastDay,
  };
}

type WeekAgg = {
  week: 1 | 2 | 3 | 4;
  plannedCases: number;
  actualCases: number;
  goodCases: number;
  rejectCases: number;
  downtimeMins: number;
  plannedProductionTimeMins: number;
  runTimeMins: number;
  wAvail: number;
  wPerf: number;
  wQual: number;
  wOee: number;
  weightSum: number;
};

/**
 * Month → Week-01 … Week-04 OEE trend
 * Week-01: days 1–7 · Week-02: 8–14 · Week-03: 15–21 · Week-04: 22–month end
 */
export async function getWeekWiseOee(
  filters: { month?: string; plantId?: string; lineId?: string },
  user?: AuthUser,
) {
  const month =
    filters.month?.slice(0, 7) ||
    new Date().toISOString().slice(0, 7);
  const { start, end, lastDay } = monthBounds(month);

  const plans = await prisma.productionPlan.findMany({
    where: {
      deletedAt: null,
      productionDate: { gte: start, lte: end },
      ...(filters.plantId ? { plantId: filters.plantId } : {}),
      ...(filters.lineId ? { lineId: filters.lineId } : {}),
      ...planScope(user),
    },
    select: {
      id: true,
      plannedCases: true,
      plannedOperatingMins: true,
      productionDate: true,
    },
    orderBy: { productionDate: 'asc' },
  });

  const planIds = plans.map((p) => p.id);
  type Agg = { actual: number; good: number; reject: number; downtime: number; plannedLoss: number };
  const byPlan = new Map<string, Agg>();
  const empty = (): Agg => ({ actual: 0, good: 0, reject: 0, downtime: 0, plannedLoss: 0 });

  if (planIds.length > 0) {
    const [entryAggs, dtByPlanCategory] = await Promise.all([
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
    ]);

    for (const row of entryAggs) {
      const a = byPlan.get(row.planId) ?? empty();
      a.actual = Number(row._sum.actualCases ?? 0);
      a.good = Number(row._sum.goodCases ?? 0);
      a.reject = Number(row._sum.rejectCases ?? 0);
      byPlan.set(row.planId, a);
    }

    const categoryIds = [...new Set(dtByPlanCategory.map((r) => r.categoryId))];
    const categories = categoryIds.length
      ? await prisma.downtimeCategory.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true, code: true },
        })
      : [];
    const catMeta = new Map(categories.map((c) => [c.id, c]));

    for (const row of dtByPlanCategory) {
      const mins = Number(row._sum.durationMins ?? 0);
      const a = byPlan.get(row.planId) ?? empty();
      a.downtime += mins;
      const meta = catMeta.get(row.categoryId);
      if (isPlannedProductionLossCategory(meta?.name, meta?.code)) a.plannedLoss += mins;
      byPlan.set(row.planId, a);
    }
  }

  const weekMap = new Map<1 | 2 | 3 | 4, WeekAgg>();
  for (const w of [1, 2, 3, 4] as const) {
    weekMap.set(w, {
      week: w,
      plannedCases: 0,
      actualCases: 0,
      goodCases: 0,
      rejectCases: 0,
      downtimeMins: 0,
      plannedProductionTimeMins: 0,
      runTimeMins: 0,
      wAvail: 0,
      wPerf: 0,
      wQual: 0,
      wOee: 0,
      weightSum: 0,
    });
  }

  for (const plan of plans) {
    const date = toDateKey(plan.productionDate);
    const w = weekOfMonth(date);
    const row = weekMap.get(w)!;
    const agg = byPlan.get(plan.id) ?? empty();
    const actual = agg.actual;
    const good = agg.good;
    const reject = agg.reject;
    const totalCount = actual || good + reject;
    const goodCount = good > 0 ? good : totalCount;

    const metrics = computeOeeMetrics({
      plannedProductionTimeMins: plan.plannedOperatingMins,
      downtimeMins: agg.downtime,
      plannedLossMins: agg.plannedLoss,
      plannedCount: plan.plannedCases,
      totalCount,
      goodCount,
    });

    const weight = Math.max(0, metrics.plannedProductionTimeMins) || 0;
    row.plannedCases += plan.plannedCases;
    row.actualCases += actual;
    row.goodCases += good;
    row.rejectCases += reject;
    row.downtimeMins += metrics.downtimeMins;
    row.plannedProductionTimeMins += metrics.plannedProductionTimeMins;
    row.runTimeMins += metrics.runTimeMins;
    if (weight > 0) {
      row.wAvail += metrics.availability * weight;
      row.wPerf += metrics.performance * weight;
      row.wQual += metrics.quality * weight;
      row.wOee += metrics.oee * weight;
      row.weightSum += weight;
    }
  }

  const weeks = ([1, 2, 3, 4] as const).map((w) => {
    const row = weekMap.get(w)!;
    const availability = row.weightSum ? Number((row.wAvail / row.weightSum).toFixed(2)) : 0;
    const performance = row.weightSum ? Number((row.wPerf / row.weightSum).toFixed(2)) : 0;
    const quality = row.weightSum ? Number((row.wQual / row.weightSum).toFixed(2)) : 0;
    const oeeFromComponents = Number(
      (((availability / 100) * (performance / 100) * (quality / 100)) * 100).toFixed(2),
    );
    const oeeWeighted = row.weightSum ? Number((row.wOee / row.weightSum).toFixed(2)) : 0;
    const oee = oeeFromComponents || oeeWeighted;
    const dayStart = (w - 1) * 7 + 1;
    const dayEnd = w === 4 ? lastDay : w * 7;

    return {
      week: w,
      label: weekLabel(w),
      range: `${String(dayStart).padStart(2, '0')}–${String(dayEnd).padStart(2, '0')}`,
      plannedCases: row.plannedCases,
      actualCases: row.actualCases,
      goodCases: row.goodCases,
      rejectCases: row.rejectCases,
      productionLoss: calcLoss(row.plannedCases, row.actualCases),
      achievement: calcAchievement(row.plannedCases, row.actualCases),
      downtimeMins: Number(row.downtimeMins.toFixed(2)),
      plannedProductionTimeMins: Number(row.plannedProductionTimeMins.toFixed(2)),
      operatingTimeMins: Number(row.runTimeMins.toFixed(2)),
      availability,
      performance,
      quality,
      oee,
    };
  });

  const totals = weeks.reduce(
    (acc, w) => {
      acc.plannedCases += w.plannedCases;
      acc.actualCases += w.actualCases;
      acc.downtimeMins += w.downtimeMins;
      return acc;
    },
    { plannedCases: 0, actualCases: 0, downtimeMins: 0 },
  );

  const monthAvail = weeks.filter((w) => w.plannedProductionTimeMins > 0);
  const avg = (key: 'oee' | 'availability' | 'performance' | 'quality') => {
    if (!monthAvail.length) return 0;
    // weight by planned production time
    let sum = 0;
    let wt = 0;
    for (const w of weeks) {
      if (w.plannedProductionTimeMins <= 0) continue;
      sum += w[key] * w.plannedProductionTimeMins;
      wt += w.plannedProductionTimeMins;
    }
    return wt ? Number((sum / wt).toFixed(2)) : 0;
  };

  return {
    month,
    weeks,
    totals: {
      plannedCases: totals.plannedCases,
      actualCases: totals.actualCases,
      downtimeMins: Number(totals.downtimeMins.toFixed(2)),
      achievement: calcAchievement(totals.plannedCases, totals.actualCases),
      oee: avg('oee'),
      availability: avg('availability'),
      performance: avg('performance'),
      quality: avg('quality'),
    },
    charts: {
      oeeByWeek: weeks.map((w) => ({
        week: w.label,
        oee: w.oee,
        availability: w.availability,
        performance: w.performance,
        quality: w.quality,
      })),
      planVsActual: weeks.map((w) => ({
        week: w.label,
        planned: w.plannedCases,
        actual: w.actualCases,
      })),
      downtimeByWeek: weeks.map((w) => ({
        week: w.label,
        downtime: w.downtimeMins,
      })),
    },
  };
}

