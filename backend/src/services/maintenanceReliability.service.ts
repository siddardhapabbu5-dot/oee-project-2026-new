import { prisma } from '../config/prisma.js';
import type { AuthUser } from '../middleware/auth.js';
import type { Prisma } from '@prisma/client';
import { calendarDateRange, toCalendarDate } from '../utils/dates.js';
import { isPlannedProductionLossCategory } from '../utils/oee.js';
import { canonicalDowntimeReasonName } from '../utils/downtimeReasonName.js';

const MTBF_TARGET_MINS = 120;
const MTTR_TARGET_MINS = 30;

function dateRange(from?: string, to?: string) {
  return calendarDateRange(from, to, 30);
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

function machineLabel(
  machine?: { name?: string | null; code?: string | null } | null,
  fallback = 'Unassigned',
) {
  const raw = String(machine?.name || machine?.code || fallback).trim() || fallback;
  const stripped = raw.replace(/^LINE[-_\s]?\d+[-_\s]*/i, '').trim();
  return stripped || raw;
}

function isFailureEvent(category?: { name?: string | null; code?: string | null } | null) {
  if (isPlannedProductionLossCategory(category?.name, category?.code)) return false;
  const code = (category?.code || '').trim().toUpperCase();
  const name = (category?.name || '').trim().toLowerCase();
  if (code === 'PL' || name === 'planned') return false;
  if (code === 'PR' || name === 'process') return false;
  if (code === 'QL' || name === 'quality') return false;
  return true;
}

function calcReliabilityMetrics(
  plannedProductionMins: number,
  failureEvents: Array<{ durationMins: number }>,
) {
  const failures = failureEvents.length;
  const breakdownMins = failureEvents.reduce((s, e) => s + (Number(e.durationMins) || 0), 0);
  const operatingTime = Math.max(0, plannedProductionMins - breakdownMins);
  const mtbf = failures > 0 ? operatingTime / failures : operatingTime;
  const mttr = failures > 0 ? breakdownMins / failures : 0;
  const availability =
    plannedProductionMins > 0 ? (operatingTime / plannedProductionMins) * 100 : 0;
  const reliability =
    MTBF_TARGET_MINS > 0 ? Math.min(100, (mtbf / MTBF_TARGET_MINS) * 100) : failures === 0 ? 100 : 0;

  return {
    plannedProductionMins: Number(plannedProductionMins.toFixed(1)),
    operatingTime: Number(operatingTime.toFixed(1)),
    breakdownMins: Number(breakdownMins.toFixed(1)),
    failures,
    mtbf: Number(mtbf.toFixed(1)),
    mttr: Number(mttr.toFixed(1)),
    availability: Number(availability.toFixed(1)),
    reliability: Number(reliability.toFixed(1)),
  };
}

function monthLabel(dateKey: string) {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  return d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
}

export async function getMaintenanceReliabilityDashboard(
  user?: AuthUser,
  opts?: {
    from?: string;
    to?: string;
    plantId?: string;
    lineId?: string;
    machineId?: string;
    shiftId?: string;
  },
) {
  const { start, end } = dateRange(opts?.from, opts?.to);

  const planWhere: Prisma.ProductionPlanWhereInput = {
    deletedAt: null,
    productionDate: { gte: start, lte: end },
    ...planScope(user),
    ...(opts?.plantId ? { plantId: opts.plantId } : {}),
    ...(opts?.lineId ? { lineId: opts.lineId } : {}),
    ...(opts?.shiftId ? { shiftId: opts.shiftId } : {}),
  };

  const plans = await prisma.productionPlan.findMany({
    where: planWhere,
    select: {
      id: true,
      planNumber: true,
      productionDate: true,
      plannedOperatingMins: true,
      line: { select: { id: true, code: true, name: true } },
      shift: { select: { id: true, name: true } },
      plant: { select: { id: true, name: true } },
    },
  });

  const planIds = plans.map((p) => p.id);

  const downtimeWhere: Prisma.DowntimeEntryWhereInput = {
    deletedAt: null,
    ...(planIds.length ? { planId: { in: planIds } } : { planId: 'none' }),
    ...(opts?.machineId ? { machineId: opts.machineId } : {}),
  };

  const downtimeEntries = planIds.length
    ? await prisma.downtimeEntry.findMany({
        where: downtimeWhere,
        include: {
          category: { select: { name: true, code: true } },
          reason: { select: { name: true } },
          machine: { select: { id: true, name: true, code: true } },
          plan: {
            select: {
              planNumber: true,
              productionDate: true,
              line: { select: { code: true, name: true } },
              shift: { select: { name: true } },
            },
          },
        },
        orderBy: [{ startTime: 'asc' }],
      })
    : [];

  const failureEntries = downtimeEntries.filter((e) => isFailureEvent(e.category));
  const totalPlannedMins = plans.reduce((s, p) => s + (Number(p.plannedOperatingMins) || 0), 0);
  const kpis = calcReliabilityMetrics(totalPlannedMins, failureEntries);

  // Monthly trend
  const monthMap = new Map<
    string,
    { label: string; plannedMins: number; failures: Array<{ durationMins: number }> }
  >();

  for (const p of plans) {
    const key = toCalendarDate(p.productionDate).slice(0, 7);
    const row = monthMap.get(key) ?? { label: monthLabel(toCalendarDate(p.productionDate)), plannedMins: 0, failures: [] };
    row.plannedMins += Number(p.plannedOperatingMins) || 0;
    monthMap.set(key, row);
  }

  for (const e of failureEntries) {
    const dateKey =
      (e.plan?.productionDate ? toCalendarDate(e.plan.productionDate) : null) ||
      toCalendarDate(e.startTime);
    const key = dateKey.slice(0, 7);
    const row = monthMap.get(key) ?? { label: monthLabel(dateKey), plannedMins: 0, failures: [] };
    row.failures.push({ durationMins: e.durationMins });
    monthMap.set(key, row);
  }

  const mtbfTrend = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, row]) => {
      const m = calcReliabilityMetrics(row.plannedMins, row.failures);
      return { period, label: row.label, mtbf: m.mtbf, mttr: m.mttr, failures: m.failures };
    });

  // By machine
  const machineMap = new Map<
    string,
    { machineId: string | null; name: string; plannedMins: number; failures: Array<{ durationMins: number }> }
  >();

  for (const e of failureEntries) {
    const name = machineLabel(e.machine);
    const id = e.machine?.id ?? null;
    const key = id || name;
    const row = machineMap.get(key) ?? { machineId: id, name, plannedMins: 0, failures: [] };
    row.failures.push({ durationMins: e.durationMins });
    machineMap.set(key, row);
  }

  // Allocate planned time proportionally by failure machine count per plan (approximation)
  for (const p of plans) {
    const planFailures = failureEntries.filter((e) => e.planId === p.id);
    const machinesOnPlan = new Set(planFailures.map((e) => e.machine?.id || machineLabel(e.machine)));
    const share = machinesOnPlan.size > 0 ? (Number(p.plannedOperatingMins) || 0) / machinesOnPlan.size : 0;
    for (const mid of machinesOnPlan) {
      const row = machineMap.get(mid);
      if (row) row.plannedMins += share;
    }
  }

  if (machineMap.size === 0 && totalPlannedMins > 0) {
    machineMap.set('line', {
      machineId: null,
      name: 'All machines',
      plannedMins: totalPlannedMins,
      failures: failureEntries.map((e) => ({ durationMins: e.durationMins })),
    });
  }

  const byMachine = [...machineMap.values()]
    .map((row) => {
      const m = calcReliabilityMetrics(row.plannedMins || totalPlannedMins, row.failures);
      return {
        machineId: row.machineId,
        name: row.name,
        mtbf: m.mtbf,
        mttr: m.mttr,
        failures: m.failures,
        breakdownMins: m.breakdownMins,
        availability: m.availability,
      };
    })
    .sort((a, b) => b.breakdownMins - a.breakdownMins);

  // Pareto — top reasons
  const reasonMap = new Map<string, { count: number; minutes: number }>();
  for (const e of failureEntries) {
    const name = canonicalDowntimeReasonName(e.reason?.name || 'Other');
    const r = reasonMap.get(name) ?? { count: 0, minutes: 0 };
    r.count += 1;
    r.minutes += Number(e.durationMins) || 0;
    reasonMap.set(name, r);
  }

  const paretoReasons = [...reasonMap.entries()]
    .map(([name, v]) => ({
      name,
      count: v.count,
      minutes: Number(v.minutes.toFixed(1)),
    }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 10);

  // Repeat failures — machine + reason
  const repeatMap = new Map<
    string,
    { machine: string; reason: string; occurrences: number; totalMins: number }
  >();
  for (const e of failureEntries) {
    const machine = machineLabel(e.machine);
    const reason = canonicalDowntimeReasonName(e.reason?.name || 'Other');
    const key = `${machine}::${reason}`;
    const row = repeatMap.get(key) ?? { machine, reason, occurrences: 0, totalMins: 0 };
    row.occurrences += 1;
    row.totalMins += Number(e.durationMins) || 0;
    repeatMap.set(key, row);
  }

  const repeatFailures = [...repeatMap.values()]
    .map((r) => ({
      ...r,
      totalMins: Number(r.totalMins.toFixed(1)),
      mttr: r.occurrences > 0 ? Number((r.totalMins / r.occurrences).toFixed(1)) : 0,
      alert: r.occurrences >= 3,
    }))
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 15);

  // Maintenance mix by category
  const categoryMap = new Map<string, { count: number; minutes: number }>();
  for (const e of downtimeEntries) {
    const cat = e.category?.name || 'Other';
    const c = categoryMap.get(cat) ?? { count: 0, minutes: 0 };
    c.count += 1;
    c.minutes += Number(e.durationMins) || 0;
    categoryMap.set(cat, c);
  }

  const maintenanceMix = [...categoryMap.entries()]
    .map(([name, v]) => ({
      name,
      count: v.count,
      minutes: Number(v.minutes.toFixed(1)),
    }))
    .sort((a, b) => b.minutes - a.minutes);

  const alerts = repeatFailures
    .filter((r) => r.alert)
    .slice(0, 8)
    .map((r) => ({
      message: `${r.machine} — ${r.reason} (${r.occurrences}×)`,
      machine: r.machine,
      reason: r.reason,
      occurrences: r.occurrences,
    }));

  return {
    from: toCalendarDate(start),
    to: toCalendarDate(end),
    targets: { mtbfMins: MTBF_TARGET_MINS, mttrMins: MTTR_TARGET_MINS },
    kpis,
    mtbfTrend,
    mttrTrend: mtbfTrend.map((r) => ({ period: r.period, label: r.label, mttr: r.mttr })),
    byMachine,
    paretoReasons,
    repeatFailures,
    maintenanceMix,
    alerts,
    breakdownHistory: failureEntries.map((e) => ({
      id: e.id,
      date:
        (e.plan?.productionDate ? toCalendarDate(e.plan.productionDate) : null) ||
        toCalendarDate(e.startTime),
      planNumber: e.plan?.planNumber || '—',
      line: e.plan?.line?.code || e.plan?.line?.name || '—',
      shift: e.plan?.shift?.name || '—',
      machine: machineLabel(e.machine),
      category: e.category?.name || '—',
      reason: canonicalDowntimeReasonName(e.reason?.name || '—'),
      failureMode: e.failureMode || '',
      maintenanceType: e.maintenanceType || '',
      technician: e.technician || '',
      durationMins: Number(e.durationMins) || 0,
      actionTaken: e.actionTaken || '',
      rootCause: e.rootCause || '',
      sparePartsUsed: e.sparePartsUsed || '',
      status: e.status || 'LOGGED',
    })),
    dataSource: 'Production downtime entries (Breakdown & unplanned stops — excludes Process, Quality, Planned)',
  };
}
