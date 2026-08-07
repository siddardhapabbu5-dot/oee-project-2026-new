/** OEE / A / P / Q / Achievement performance bands */

export type MetricKind = 'oee' | 'availability' | 'performance' | 'quality' | 'achievement';

export type MetricBand = 'excellent' | 'good' | 'average' | 'poor' | 'critical';

/** KpiCard-compatible tones including 5-band scale (`fair` = yellow / Good band) */
export type MetricTone = MetricBand | 'fair' | 'default' | 'info' | 'warn' | 'bad';

const BANDS: Record<MetricKind, Array<{ min: number; band: MetricBand }>> = {
  oee: [
    { min: 85, band: 'excellent' },
    { min: 75, band: 'good' },
    { min: 60, band: 'average' },
    { min: 40, band: 'poor' },
    { min: 0, band: 'critical' },
  ],
  availability: [
    { min: 90, band: 'excellent' },
    { min: 80, band: 'good' },
    { min: 70, band: 'average' },
    { min: 50, band: 'poor' },
    { min: 0, band: 'critical' },
  ],
  performance: [
    { min: 95, band: 'excellent' },
    { min: 90, band: 'good' },
    { min: 80, band: 'average' },
    { min: 60, band: 'poor' },
    { min: 0, band: 'critical' },
  ],
  quality: [
    { min: 99, band: 'excellent' },
    { min: 98, band: 'good' },
    { min: 95, band: 'average' },
    { min: 90, band: 'poor' },
    { min: 0, band: 'critical' },
  ],
  achievement: [
    { min: 100, band: 'excellent' },
    { min: 95, band: 'good' },
    { min: 85, band: 'average' },
    { min: 70, band: 'poor' },
    { min: 0, band: 'critical' },
  ],
};

export const METRIC_BAND_LABEL: Record<MetricBand, string> = {
  excellent: 'Excellent',
  good: 'Good',
  average: 'Average',
  poor: 'Poor',
  critical: 'Critical',
};

export const METRIC_BAND_HEX: Record<MetricBand, string> = {
  excellent: '#16A34A',
  good: '#FACC15',
  average: '#F97316',
  poor: '#DC2626',
  critical: '#374151',
};

export const METRIC_BAND_USAGE: Record<MetricBand, string> = {
  excellent: 'Target achieved',
  good: 'Minor attention needed',
  average: 'Needs improvement',
  poor: 'Immediate action required',
  critical: 'Production at risk',
};

export const METRIC_BAND_RANGES: Record<MetricKind, Record<MetricBand, string>> = {
  oee: {
    excellent: '≥ 85%',
    good: '75–84.99%',
    average: '60–74.99%',
    poor: '40–59.99%',
    critical: '< 40%',
  },
  availability: {
    excellent: '≥ 90%',
    good: '80–89.99%',
    average: '70–79.99%',
    poor: '50–69.99%',
    critical: '< 50%',
  },
  performance: {
    excellent: '≥ 95%',
    good: '90–94.99%',
    average: '80–89.99%',
    poor: '60–79.99%',
    critical: '< 60%',
  },
  quality: {
    excellent: '≥ 99%',
    good: '98–98.99%',
    average: '95–97.99%',
    poor: '90–94.99%',
    critical: '< 90%',
  },
  achievement: {
    excellent: '≥ 100%',
    good: '95–99.99%',
    average: '85–94.99%',
    poor: '70–84.99%',
    critical: '< 70%',
  },
};

/** Downtime duration bands (maps to status colours; Critical unused for DT) */
export type DowntimeBand = 'excellent' | 'good' | 'average' | 'poor';

export const DOWNTIME_BAND_ROWS: Array<{ band: DowntimeBand; range: string; emoji: string }> = [
  { band: 'excellent', range: '0–5 min', emoji: '🟢' },
  { band: 'good', range: '6–15 min', emoji: '🟡' },
  { band: 'average', range: '16–30 min', emoji: '🟠' },
  { band: 'poor', range: '>30 min', emoji: '🔴' },
];

export function downtimeBand(mins: number): DowntimeBand {
  const n = Number(mins);
  if (!Number.isFinite(n) || n < 0) return 'poor';
  if (n <= 5) return 'excellent';
  if (n <= 15) return 'good';
  if (n <= 30) return 'average';
  return 'poor';
}

export function downtimeTone(mins: number): MetricTone {
  const band = downtimeBand(mins);
  if (band === 'good') return 'fair';
  return band;
}

export function downtimeColor(mins: number): string {
  return `var(--band-${downtimeBand(mins)})`;
}

export type PillarKind = 'availability' | 'performance' | 'quality';

export const PILLAR_COLOR: Record<PillarKind, string> = {
  availability: 'var(--pillar-availability)',
  performance: 'var(--pillar-performance)',
  quality: 'var(--pillar-quality)',
};

export const PILLAR_COLOR_HEX: Record<PillarKind, string> = {
  availability: '#2563EB',
  performance: '#F97316',
  quality: '#9333EA',
};

export const LOSS_CATEGORY_COLORS: Array<{ name: string; hex: string; cssVar: string; emoji: string }> = [
  { name: 'Availability', hex: '#2563EB', cssVar: 'var(--pillar-availability)', emoji: '🔵' },
  { name: 'Performance', hex: '#F97316', cssVar: 'var(--pillar-performance)', emoji: '🟠' },
  { name: 'Quality', hex: '#9333EA', cssVar: 'var(--pillar-quality)', emoji: '🟣' },
  { name: 'Planned Production Loss', hex: '#9CA3AF', cssVar: 'var(--cat-planned-loss)', emoji: '⚪' },
  { name: 'Mechanical Breakdown', hex: '#DC2626', cssVar: 'var(--cat-mechanical)', emoji: '🔴' },
  { name: 'Electrical Breakdown', hex: '#F59E0B', cssVar: 'var(--cat-electrical)', emoji: '🟡' },
  { name: 'Utility Failure', hex: '#06B6D4', cssVar: 'var(--cat-utility)', emoji: '🔷' },
  { name: 'Material Shortage', hex: '#92400E', cssVar: 'var(--cat-material)', emoji: '🟤' },
  { name: 'Quality Hold', hex: '#9333EA', cssVar: 'var(--cat-quality-hold)', emoji: '🟣' },
  { name: 'Manpower', hex: '#0D9488', cssVar: 'var(--cat-manpower)', emoji: '🟢' },
];

const LOSS_CATEGORY_LOOKUP = LOSS_CATEGORY_COLORS.filter(
  (r) => !['Availability', 'Performance', 'Quality'].includes(r.name),
);

export function lossCategoryColor(name: string): string {
  const n = (name || '').trim().toLowerCase();
  if (!n) return 'var(--muted)';
  const hit = LOSS_CATEGORY_LOOKUP.find(
    (r) => n === r.name.toLowerCase() || n.includes(r.name.toLowerCase()) || r.name.toLowerCase().includes(n),
  );
  if (hit) return hit.cssVar;
  if (n.includes('planned')) return 'var(--cat-planned-loss)';
  if (n.includes('mechanical')) return 'var(--cat-mechanical)';
  if (n.includes('electrical') || n.includes('electric')) return 'var(--cat-electrical)';
  if (n.includes('utility') || n.includes('power') || n.includes('air') || n.includes('water'))
    return 'var(--cat-utility)';
  if (n.includes('material') || n.includes('shortage') || n.includes('starvation')) return 'var(--cat-material)';
  if (n.includes('quality') || n.includes('hold') || n.includes('qa')) return 'var(--cat-quality-hold)';
  if (n.includes('manpower') || n.includes('operator') || n.includes('staff')) return 'var(--cat-manpower)';
  return 'var(--muted)';
}

/** Example strip shown on Rating Scale guidance */
export const EXAMPLE_KPI_STRIP: Array<{
  label: string;
  value: string;
  kind?: MetricKind;
  downtimeMins?: number;
}> = [
  { label: 'OEE', value: '87.5%', kind: 'oee' },
  { label: 'Availability', value: '91.2%', kind: 'availability' },
  { label: 'Performance', value: '88.7%', kind: 'performance' },
  { label: 'Quality', value: '99.4%', kind: 'quality' },
  { label: 'Downtime', value: '24 min', downtimeMins: 24 },
  { label: 'Production Achievement', value: '93%', kind: 'achievement' },
];

export function metricBand(kind: MetricKind, value: number): MetricBand {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 'critical';
  for (const row of BANDS[kind]) {
    if (n >= row.min) return row.band;
  }
  return 'critical';
}

export function metricTone(kind: MetricKind, value: number): MetricTone {
  if (!Number.isFinite(Number(value))) return 'default';
  const band = metricBand(kind, value);
  // 'good' is reserved for legacy green KpiCard tone — map yellow band to 'fair'
  if (band === 'good') return 'fair';
  return band;
}

export function metricColor(kind: MetricKind, value: number): string {
  return `var(--band-${metricBand(kind, value)})`;
}

export function exampleKpiColor(row: (typeof EXAMPLE_KPI_STRIP)[number]): string {
  if (row.downtimeMins != null) return downtimeColor(row.downtimeMins);
  if (row.kind) {
    const n = parseFloat(row.value);
    return metricColor(row.kind, n);
  }
  return 'var(--text)';
}
