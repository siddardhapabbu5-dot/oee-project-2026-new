/**
 * Standard OEE formulas:
 *
 *   Availability = Run Time ÷ Planned Production Time × 100%
 *   Performance  = (Ideal Cycle Time × Total Count) ÷ Run Time × 100%
 *   Quality      = Good Count ÷ Total Count × 100%
 *   OEE          = Availability × Performance × Quality
 *
 * Where:
 *   Run Time               = Planned Production Time − Downtime
 *   Ideal Cycle Time       = Planned Production Time ÷ Planned Count
 *                            (or 60 ÷ rated cases/hour when capacity is known)
 *   Total Count            = total cases produced
 *   Good Count             = accepted / good cases
 */

export function calcLoss(planned: number, actual: number) {
  return Math.max(0, planned - actual);
}

export function calcAchievement(planned: number, actual: number) {
  if (!planned) return 0;
  return Number(((actual / planned) * 100).toFixed(2));
}

/** Run Time (minutes) = Planned Production Time − Downtime */
export function calcRunTime(plannedProductionTimeMins: number, downtimeMins: number) {
  return Math.max(0, (plannedProductionTimeMins || 0) - Math.max(0, downtimeMins || 0));
}

/**
 * Ideal Cycle Time in minutes per case.
 * Prefer line rated speed (capacityCph); else Planned Time ÷ Planned Count.
 */
export function calcIdealCycleTimeMins(
  plannedProductionTimeMins: number,
  plannedCount: number,
  capacityCph?: number | null,
) {
  if (capacityCph && capacityCph > 0) {
    return 60 / capacityCph;
  }
  if (!plannedCount || plannedCount <= 0 || !plannedProductionTimeMins) return 0;
  return plannedProductionTimeMins / plannedCount;
}

/** Availability = Run Time ÷ Planned Production Time × 100% */
export function calcAvailability(plannedProductionTimeMins: number, downtimeMins: number) {
  if (!plannedProductionTimeMins || plannedProductionTimeMins <= 0) return 0;
  const runTime = calcRunTime(plannedProductionTimeMins, downtimeMins);
  return Number(((runTime / plannedProductionTimeMins) * 100).toFixed(2));
}

/**
 * Performance = (Ideal Cycle Time × Total Count) ÷ Run Time × 100%
 *
 * Backward-compatible signature used across services:
 * calcPerformance(plannedCases, actualCases, plannedMins, downtimeMins, capacityCph?)
 */
export function calcPerformance(
  plannedCases: number,
  actualCases: number,
  plannedMins: number,
  downtimeMins: number,
  capacityCph?: number | null,
) {
  const runTime = calcRunTime(plannedMins, downtimeMins);
  if (!runTime || runTime <= 0) return 0;
  const idealCycleTime = calcIdealCycleTimeMins(plannedMins, plannedCases, capacityCph);
  if (!idealCycleTime || idealCycleTime <= 0) return 0;
  const totalCount = Math.max(0, actualCases || 0);
  const performance = ((idealCycleTime * totalCount) / runTime) * 100;
  return Number(Math.min(100, Math.max(0, performance)).toFixed(2));
}

/** Quality = Good Count ÷ Total Count × 100% */
export function calcQuality(goodCount: number, totalCount: number) {
  if (!totalCount || totalCount <= 0) return 0;
  return Number(((Math.max(0, goodCount) / totalCount) * 100).toFixed(2));
}

/** OEE = Availability × Performance × Quality (as percentages) */
export function calcOee(availability: number, performance: number, quality: number) {
  return Number((((availability / 100) * (performance / 100) * (quality / 100)) * 100).toFixed(2));
}

export type OeeInputs = {
  plannedProductionTimeMins: number;
  downtimeMins: number;
  plannedCount: number;
  totalCount: number;
  goodCount: number;
  capacityCph?: number | null;
};

export function computeOeeMetrics(input: OeeInputs) {
  const planned = Math.max(0, input.plannedProductionTimeMins || 0);
  const downtime = Math.max(0, input.downtimeMins || 0);
  const runTime = calcRunTime(planned, downtime);
  const totalCount = Math.max(0, input.totalCount || 0);
  const goodCount = Math.max(0, input.goodCount || 0);
  const idealCycleTime = calcIdealCycleTimeMins(planned, input.plannedCount, input.capacityCph);

  const availabilityRaw = calcAvailability(planned, downtime);
  const performanceRaw =
    runTime > 0 && idealCycleTime > 0
      ? Number((((idealCycleTime * totalCount) / runTime) * 100).toFixed(2))
      : 0;
  const qualityRaw = calcQuality(goodCount, totalCount || goodCount);

  // Cap each factor at 100% for standard OEE product (shop-floor reporting)
  const availability = Math.min(100, Math.max(0, availabilityRaw));
  const performance = Math.min(100, Math.max(0, performanceRaw));
  const quality = Math.min(100, Math.max(0, qualityRaw));
  const oee = calcOee(availability, performance, quality);

  return {
    plannedProductionTimeMins: planned,
    downtimeMins: downtime,
    runTimeMins: runTime,
    idealCycleTimeMins: idealCycleTime ? Number(idealCycleTime.toFixed(6)) : 0,
    totalCount,
    goodCount,
    availability,
    performance,
    quality,
    availabilityRaw,
    performanceRaw,
    qualityRaw,
    oee,
  };
}

/** Capacity Utilization = (Actual Cases ÷ Planned Cases) × 100% */
export function calcCapacityUtilization(actualCases: number, plannedCases: number) {
  if (!plannedCases || plannedCases <= 0) return 0;
  return Number(((Math.max(0, actualCases || 0) / plannedCases) * 100).toFixed(2));
}

export function minutesBetween(start: Date, end: Date) {
  return Math.max(0, (end.getTime() - start.getTime()) / 60000);
}
