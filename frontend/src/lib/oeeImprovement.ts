import { METRIC_BAND_LABEL, METRIC_BAND_USAGE, metricBand, type MetricKind } from './metricBands';

function calcOee(availability: number, performance: number, quality: number) {
  return Number((((availability / 100) * (performance / 100) * (quality / 100)) * 100).toFixed(2));
}

/** World-class / Excellent band used as the management target. */
export const OEE_EXCELLENT = {
  availability: 90,
  performance: 95,
  quality: 99,
  oee: 85,
} as const;

export type PillarId = 'availability' | 'performance' | 'quality';

export type ImprovementKpis = {
  oee: number;
  availability: number;
  performance: number;
  quality: number;
  plannedCases: number;
  actualCases: number;
  goodCases: number;
  rejectCases: number;
  downtime: number;
  runTimeMins?: number;
  plannedProductionTimeMins?: number;
  idealCycleTimeMins?: number;
};

export type ImprovementCharts = {
  downtimeByCategory?: Array<{ name: string; minutes: number }>;
  downtimeByMachine?: Array<{ name: string; minutes: number }>;
  linePerformance?: Array<{ line: string; planned: number; actual: number; downtime?: number }>;
};

export type PillarGap = {
  id: PillarId;
  label: string;
  short: 'A' | 'P' | 'Q';
  value: number;
  target: number;
  band: string;
  bandHint: string;
  oeeIfExcellent: number;
  oeeGain: number;
  casesRecoverable: number;
  casesLabel: string;
};

export type RankedAction = {
  pillar: PillarId;
  title: string;
  why: string;
  doNext: string;
  href: string;
  hrefLabel: string;
  oeeGain: number;
  oeeIfFixed: number;
};

export type OeeImprovement = {
  hasData: boolean;
  headline: string;
  summary: string;
  constraint: PillarId | null;
  currentOee: number;
  oeeIfAllExcellent: number;
  gapToExcellent: number;
  pillars: PillarGap[];
  actions: RankedAction[];
  weakestLine: { line: string; achievement: number; planned: number; actual: number } | null;
};

function round2(n: number) {
  return Number(n.toFixed(2));
}

function round1(n: number) {
  return Number(n.toFixed(1));
}

function hoursFromMins(mins: number) {
  if (!mins) return '0 h';
  if (mins < 60) return `${Math.round(mins)} min`;
  return `${(mins / 60).toFixed(1)} h`;
}

function casesFromMins(mins: number, idealCycleMins: number) {
  if (!idealCycleMins || idealCycleMins <= 0 || mins <= 0) return 0;
  return Math.max(0, Math.round(mins / idealCycleMins));
}

function categoryAdvice(name: string): string {
  const n = (name || '').toLowerCase();
  if (n.includes('mechanical')) {
    return `Put a focused PM / spare-parts plan on ${name} — it is the largest unplanned stop.`;
  }
  if (n.includes('electrical') || n.includes('electric')) {
    return `Investigate drives, sensors, and MCC trips behind ${name} before the next shift.`;
  }
  if (n.includes('material') || n.includes('shortage') || n.includes('starvation')) {
    return `Close material shortages (${name}) so the line is not waiting on bottles, caps, or labels.`;
  }
  if (n.includes('manpower') || n.includes('operator') || n.includes('staff')) {
    return `Tighten shift start and handover — ${name} is eating operating time.`;
  }
  if (n.includes('utility') || n.includes('power') || n.includes('air') || n.includes('water')) {
    return `Stabilise utilities (${name}) — compressor, air, power, or water supply.`;
  }
  if (n.includes('quality') || n.includes('hold')) {
    return `Shorten quality holds (${name}) with faster release and inline checks.`;
  }
  if (n.includes('changeover') || n.includes('setup')) {
    return `Standardise changeover steps to cut ${name} time toward the standard.`;
  }
  if (n.includes('planned')) {
    return `${name} is planned time, not OEE Availability. Protect unplanned stops instead.`;
  }
  return `Attack the largest downtime bucket: ${name}.`;
}

function weakestLine(rows: ImprovementCharts['linePerformance']) {
  const scored = (rows ?? [])
    .filter((r) => (r.planned || 0) > 0)
    .map((r) => ({
      line: r.line,
      planned: r.planned,
      actual: r.actual,
      achievement: (r.actual / r.planned) * 100,
    }))
    .sort((a, b) => a.achievement - b.achievement);
  return scored[0] ?? null;
}

export function buildOeeImprovement(kpis: ImprovementKpis, charts: ImprovementCharts = {}): OeeImprovement {
  const a = Number(kpis.availability) || 0;
  const p = Number(kpis.performance) || 0;
  const q = Number(kpis.quality) || 0;
  const currentOee = Number(kpis.oee) || calcOee(a, p, q);
  const actual = Number(kpis.actualCases) || 0;
  const planned = Number(kpis.plannedCases) || 0;
  const reject = Number(kpis.rejectCases) || 0;
  const downtime = Number(kpis.downtime) || 0;
  const runTime = Number(kpis.runTimeMins) || 0;
  const ideal = Number(kpis.idealCycleTimeMins) || 0;

  const hasData = planned > 0 || actual > 0 || currentOee > 0 || downtime > 0;
  const oeeIfA = calcOee(Math.max(a, OEE_EXCELLENT.availability), p, q);
  const oeeIfP = calcOee(a, Math.max(p, OEE_EXCELLENT.performance), q);
  const oeeIfQ = calcOee(a, p, Math.max(q, OEE_EXCELLENT.quality));
  const oeeIfAllExcellent = calcOee(
    Math.max(a, OEE_EXCELLENT.availability),
    Math.max(p, OEE_EXCELLENT.performance),
    Math.max(q, OEE_EXCELLENT.quality),
  );

  const speedLossCases =
    runTime > 0 && ideal > 0 ? Math.max(0, Math.round(runTime / ideal - actual)) : 0;
  const downtimeCases = casesFromMins(downtime, ideal);

  const topCategory = [...(charts.downtimeByCategory ?? [])]
    .filter((r) => r.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)[0];
  const topMachine = [...(charts.downtimeByMachine ?? [])]
    .filter((r) => r.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)[0];
  const line = weakestLine(charts.linePerformance);

  const pillarMeta: Array<{
    id: PillarId;
    label: string;
    short: 'A' | 'P' | 'Q';
    kind: MetricKind;
    value: number;
    target: number;
    oeeIfExcellent: number;
    casesRecoverable: number;
    casesLabel: string;
  }> = [
    {
      id: 'availability',
      label: 'Availability',
      short: 'A',
      kind: 'availability',
      value: a,
      target: OEE_EXCELLENT.availability,
      oeeIfExcellent: oeeIfA,
      casesRecoverable: downtimeCases,
      casesLabel: 'cases lost to unplanned stops',
    },
    {
      id: 'performance',
      label: 'Performance',
      short: 'P',
      kind: 'performance',
      value: p,
      target: OEE_EXCELLENT.performance,
      oeeIfExcellent: oeeIfP,
      casesRecoverable: speedLossCases,
      casesLabel: 'cases of speed / micro-stop loss',
    },
    {
      id: 'quality',
      label: 'Quality',
      short: 'Q',
      kind: 'quality',
      value: q,
      target: OEE_EXCELLENT.quality,
      oeeIfExcellent: oeeIfQ,
      casesRecoverable: Math.max(0, Math.round(reject)),
      casesLabel: 'reject cases',
    },
  ];

  const pillars: PillarGap[] = pillarMeta.map((row) => {
    const band = metricBand(row.kind, row.value);
    return {
      id: row.id,
      label: row.label,
      short: row.short,
      value: row.value,
      target: row.target,
      band: METRIC_BAND_LABEL[band],
      bandHint: METRIC_BAND_USAGE[band],
      oeeIfExcellent: row.oeeIfExcellent,
      oeeGain: round2(Math.max(0, row.oeeIfExcellent - currentOee)),
      casesRecoverable: row.casesRecoverable,
      casesLabel: row.casesLabel,
    };
  });

  const ranked = [...pillars].sort((x, y) => y.oeeGain - x.oeeGain);
  const constraint = ranked.find((row) => row.oeeGain > 0.05)?.id ?? null;

  const actions: RankedAction[] = [];

  const avail = pillars.find((x) => x.id === 'availability')!;
  if (avail.oeeGain > 0.05) {
    const cat = topCategory?.name;
    const machineBit = topMachine ? ` Worst machine: ${topMachine.name} (${hoursFromMins(topMachine.minutes)}).` : '';
    actions.push({
      pillar: 'availability',
      title: 'Cut unplanned downtime',
      why: cat
        ? `${cat} is the largest stop (${hoursFromMins(topCategory!.minutes)} of ${hoursFromMins(downtime)} unplanned).`
        : `The line was down ${hoursFromMins(downtime)} while it should have been producing.`,
      doNext: `${cat ? categoryAdvice(cat) : 'Reduce unplanned stops first — they drag Availability, which multiplies into OEE.'}${machineBit}`,
      href: '/downtime-analysis',
      hrefLabel: 'Downtime analysis',
      oeeGain: avail.oeeGain,
      oeeIfFixed: avail.oeeIfExcellent,
    });
  }

  const perf = pillars.find((x) => x.id === 'performance')!;
  if (perf.oeeGain > 0.05) {
    actions.push({
      pillar: 'performance',
      title: 'Run closer to rated speed',
      why:
        speedLossCases > 0
          ? `While the line was running, output was about ${speedLossCases.toLocaleString()} cases below ideal cycle.`
          : `Performance is ${p}% vs a ${OEE_EXCELLENT.performance}% Excellent target.`,
      doNext:
        'Check filler speed, bottle/cap feed, and micro-stops under 5 minutes. These do not show as downtime but they still cut Performance.',
      href: '/production-entries',
      hrefLabel: 'Production entries',
      oeeGain: perf.oeeGain,
      oeeIfFixed: perf.oeeIfExcellent,
    });
  }

  const qual = pillars.find((x) => x.id === 'quality')!;
  if (qual.oeeGain > 0.05) {
    actions.push({
      pillar: 'quality',
      title: 'Reduce reject cases',
      why: `${Math.round(reject).toLocaleString()} reject cases of ${Math.round(actual).toLocaleString()} produced (Quality ${q}%).`,
      doNext: 'Tighten filling, capping, and labelling checks. Every reject case lowers Quality and OEE even when the line is fast.',
      href: '/rft',
      hrefLabel: 'RFT dashboard',
      oeeGain: qual.oeeGain,
      oeeIfFixed: qual.oeeIfExcellent,
    });
  }

  actions.sort((x, y) => y.oeeGain - x.oeeGain);

  const top = constraint ? pillars.find((x) => x.id === constraint)! : null;
  const gapToExcellent = round2(Math.max(0, OEE_EXCELLENT.oee - currentOee));

  let headline: string;
  let summary: string;
  if (!hasData) {
    headline = 'No production entries in this date range';
    summary = 'Pick a range that has work orders, then this panel will show where OEE can rise.';
  } else if (!top) {
    headline = `OEE is ${round1(currentOee)}% — all three pillars are at Excellent`;
    summary = 'Hold the standard. Use production entries to keep Availability, speed, and rejects from slipping.';
  } else {
    headline = `${top.label} is the biggest OEE drag`;
    const lineBit =
      line && line.achievement < 95
        ? ` Weakest line vs plan: ${line.line} (${round1(line.achievement)}% of planned cases).`
        : '';
    summary = `OEE is ${round1(currentOee)}% (A ${round1(a)}% × P ${round1(p)}% × Q ${round1(q)}%). If ${top.label} reached Excellent (${top.target}%), OEE would be about ${round1(top.oeeIfExcellent)}% — a +${round1(top.oeeGain)} point lift.${lineBit}`;
  }

  return {
    hasData,
    headline,
    summary,
    constraint,
    currentOee: round2(currentOee),
    oeeIfAllExcellent: round2(oeeIfAllExcellent),
    gapToExcellent,
    pillars,
    actions,
    weakestLine: line
      ? {
          line: line.line,
          achievement: round1(line.achievement),
          planned: line.planned,
          actual: line.actual,
        }
      : null,
  };
}
