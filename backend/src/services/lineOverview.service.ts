import { prisma } from '../config/prisma.js';
import type { AuthUser } from '../middleware/auth.js';
import {
  calcAchievement,
  calcCapacityUtilization,
  calcLoss,
  computeOeeMetrics,
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
      downtimeEntries: { where: { deletedAt: null } },
    },
    orderBy: [{ productionDate: 'asc' }, { createdAt: 'asc' }],
  });

  const lineMap = new Map<string, LineAgg>();

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
    const downtime = plan.downtimeEntries.reduce((s, e) => s + e.durationMins, 0);
    const totalCount = actual || good + reject;
    const goodCount = good > 0 ? good : totalCount;

    const metrics = computeOeeMetrics({
      plannedProductionTimeMins: plan.plannedOperatingMins,
      downtimeMins: downtime,
      plannedCount: plan.plannedCases,
      totalCount,
      goodCount,
    });

    const weight = Math.max(0, plan.plannedOperatingMins) || 0;
    row.planCount += 1;
    row.plannedCases += plan.plannedCases;
    row.actualCases += actual;
    row.goodCases += good;
    row.rejectCases += reject;
    row.downtimeMins += downtime;
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

  return {
    reportDate,
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    formula: {
      availability: 'Run Time ÷ Planned Production Time × 100%',
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
    },
  };
}
