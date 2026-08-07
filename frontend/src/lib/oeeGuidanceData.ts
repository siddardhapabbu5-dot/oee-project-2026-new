import { Gauge, PackageSearch, TimerOff, type LucideIcon } from 'lucide-react';
import {
  METRIC_BAND_LABEL,
  METRIC_BAND_RANGES,
  type MetricBand,
  type MetricKind,
} from './metricBands';

export const BAND_ORDER: MetricBand[] = ['excellent', 'good', 'average', 'poor', 'critical'];

export const BAND_EMOJI: Record<MetricBand, string> = {
  excellent: '🟢',
  good: '🟡',
  average: '🟠',
  poor: '🔴',
  critical: '⚫',
};

export const METRIC_ROWS: Array<{ kind: MetricKind; label: string }> = [
  { kind: 'oee', label: 'OEE' },
  { kind: 'availability', label: 'Availability' },
  { kind: 'performance', label: 'Performance' },
  { kind: 'quality', label: 'Quality' },
  { kind: 'achievement', label: 'Achievement' },
];

export { METRIC_BAND_LABEL, METRIC_BAND_RANGES };

export type ReasonGroup = {
  title: string;
  items: string[];
};

export type PillarId = 'availability' | 'performance' | 'quality';

export type Pillar = {
  id: PillarId;
  label: string;
  short: string;
  formula: string;
  meaning: string;
  icon: LucideIcon;
  tone: string;
  soft: string;
  groups: ReasonGroup[];
};

export const PILLARS: Pillar[] = [
  {
    id: 'availability',
    label: 'Availability',
    short: 'A',
    formula: 'Operating Time ÷ Planned Production Time',
    meaning:
      'Time the line was actually running versus Planned Production Time. Planned Production Loss (startup, PM, changeover) is removed from Planned Time first; only unplanned downtime reduces Availability.',
    icon: TimerOff,
    tone: 'var(--pillar-availability)',
    soft: 'color-mix(in oklab, var(--pillar-availability) 12%, transparent)',
    groups: [
      {
        title: 'Planned Production Loss',
        items: [
          'Preventive maintenance',
          'Predictive maintenance',
          'Lubrication',
          'Scheduled inspection',
          'Calibration',
          'Brand change',
          'Bottle size change',
          'Cap change',
          'Label change',
          'Carton change',
          'SKU change',
        ],
      },
      {
        title: 'Mechanical Breakdown',
        items: [
          'Filling valve failure',
          'Filling nozzle damage',
          'Capper head failure',
          'Conveyor chain broken',
          'Conveyor belt damaged',
          'Bearing failure',
          'Gearbox failure',
          'Motor coupling failure',
          'Pump failure',
          'Roller damaged',
          'Shaft broken',
          'Chain sprocket worn',
          'Shrink wrapper mechanical fault',
          'Palletizer mechanical fault',
        ],
      },
      {
        title: 'Electrical Breakdown',
        items: [
          'PLC fault',
          'HMI fault',
          'VFD trip',
          'Motor overload',
          'MCC fault',
          'Control panel fault',
          'Sensor failure',
          'Solenoid valve failure',
          'Relay failure',
          'Cable damage',
          'Encoder fault',
          'Servo drive fault',
        ],
      },
      {
        title: 'Utility Failure',
        items: [
          'Power failure',
          'Low voltage',
          'Air compressor failure',
          'Low air pressure',
          'Water supply interruption',
          'Chiller failure',
          'Cooling water unavailable',
          'Generator failure',
        ],
      },
      {
        title: 'Material Shortage',
        items: [
          'PET bottles unavailable',
          'Caps unavailable',
          'Labels unavailable',
          'Shrink film unavailable',
          'Cartons unavailable',
          'Pallets unavailable',
          'Stretch film unavailable',
          'Ink unavailable',
        ],
      },
      {
        title: 'Quality Hold',
        items: [
          'Quality inspection',
          'Product hold',
          'Microbiology test',
          'Leakage investigation',
          'Packaging quality issue',
        ],
      },
      {
        title: 'Manpower',
        items: ['Operator absent', 'Shift handover delay', 'Late line start', 'No technician available'],
      },
      {
        title: 'Process Delay',
        items: [
          'Line clearing delay',
          'CIP / sanitation delay',
          'Startup delay after stop',
          'Waiting for QC release',
          'Waiting for next SKU readiness',
        ],
      },
      {
        title: 'Safety',
        items: [
          'Emergency stop activated',
          'Safety interlock triggered',
          'Accident investigation',
          'Unsafe condition',
        ],
      },
      {
        title: 'External Causes',
        items: [
          'Customer / dispatch hold',
          'Logistics delay',
          'Vendor delivery delay',
          'Weather / force majeure',
          'Regulatory inspection stop',
        ],
      },
    ],
  },
  {
    id: 'performance',
    label: 'Performance',
    short: 'P',
    formula: 'Actual Output ÷ Ideal Output (at design speed)',
    meaning:
      'How close the line ran to its ideal speed while it was running. Speed loss, minor stops, and feed delays reduce Performance — even when the line is “up”.',
    icon: Gauge,
    tone: 'var(--pillar-performance)',
    soft: 'color-mix(in oklab, var(--pillar-performance) 14%, transparent)',
    groups: [
      {
        title: 'Speed Loss',
        items: ['Reduced Filler Speed', 'Running below rated BPM', 'Intentional speed reduction'],
      },
      {
        title: 'Minor Stops',
        items: ['Minor Bottle Jams', 'Conveyor Blocking', 'Sensor False Trigger', 'Short micro-stop (< 5 min)'],
      },
      {
        title: 'Machine Adjustment',
        items: ['Operator Machine Adjustment', 'Temperature Adjustment', 'Guide / rail setting', 'Timing adjustment'],
      },
      {
        title: 'Material Issues',
        items: [
          'Bottle Starvation',
          'Cap Starvation',
          'Label Feed Delay',
          'Shrink Film Feed Delay',
          'Carton feed delay',
        ],
      },
      {
        title: 'Mechanical Issues',
        items: [
          'Conveyor hesitation',
          'Filler mechanical drag',
          'Capper mechanical hesitation',
          'Wrapper mechanical slowdown',
        ],
      },
      {
        title: 'Electrical Issues',
        items: ['Sensor False Trigger', 'Intermittent sensor fault', 'Drive hunting / unstable speed'],
      },
      {
        title: 'Utility Issues',
        items: ['Low Air Pressure', 'Unstable water pressure', 'Voltage fluctuation affecting speed'],
      },
      {
        title: 'Operator Issues',
        items: ['Manual Intervention', 'Operator Machine Adjustment', 'Incorrect set-point by operator'],
      },
      {
        title: 'Process Variation',
        items: ['Product Change Stabilisation', 'Temperature Adjustment', 'Fill level hunting', 'Foam control delay'],
      },
      {
        title: 'Quality Inspection Delays',
        items: ['Quality Inspection Slowdown', 'Inline check delay', 'Sample pull delay'],
      },
    ],
  },
  {
    id: 'quality',
    label: 'Quality',
    short: 'Q',
    formula: 'Good Output ÷ Total Output',
    meaning:
      'Share of bottles/cases that meet specification. Defects in fill, caps, bottles, labels, coding, packs, or product quality reduce Quality and OEE.',
    icon: PackageSearch,
    tone: 'var(--pillar-quality)',
    soft: 'color-mix(in oklab, var(--pillar-quality) 12%, transparent)',
    groups: [
      {
        title: 'Filling Defects',
        items: [
          'Underfilled bottle',
          'Overfilled bottle',
          'No fill',
          'Low fill level',
          'Foaming during filling',
          'Water leakage from filling valve',
        ],
      },
      {
        title: 'Cap Defects',
        items: ['Missing cap', 'Loose cap', 'Crooked cap', 'Broken cap', 'Cap leakage', 'Wrong cap colour'],
      },
      {
        title: 'Bottle Defects',
        items: [
          'Damaged bottle',
          'Deformed bottle',
          'Cracked bottle',
          'Dirty bottle',
          'Bottle scratches',
          'Bottle with incorrect weight',
        ],
      },
      {
        title: 'Label Defects',
        items: [
          'Missing label',
          'Crooked label',
          'Wrinkled label',
          'Double label',
          'Incorrect label',
          'Label not sticking properly',
          'Barcode unreadable',
        ],
      },
      {
        title: 'Date Coding Defects',
        items: [
          'Missing batch code',
          'Wrong batch code',
          'Missing manufacturing date',
          'Missing expiry date',
          'Poor print quality',
        ],
      },
      {
        title: 'Packaging Defects',
        items: [
          'Damaged shrink film',
          'Loose shrink pack',
          'Torn shrink film',
          'Missing bottles in a pack',
          'Damaged carton',
          'Incorrect case count',
          'Poor pallet stacking',
        ],
      },
      {
        title: 'Product Quality',
        items: [
          'High TDS',
          'Low TDS',
          'Incorrect pH',
          'Microbiological failure',
          'Turbidity out of specification',
          'Taste or odour issue',
          'Water contamination',
        ],
      },
      {
        title: 'Startup Rejects',
        items: [
          'First-piece rejects after startup',
          'Rejects after changeover',
          'Rejects after breakdown restart',
          'Warm-up / purge scrap',
        ],
      },
      {
        title: 'Rework',
        items: [
          'Relabel rework',
          'Recap rework',
          'Repack rework',
          'Recode rework',
          'Sort & salvage rework',
        ],
      },
      {
        title: 'Inspection & QA Rejections',
        items: [
          'Inline vision rejection',
          'Manual QA rejection',
          'Lab sample failure',
          'Customer complaint: bottle leakage',
          'Customer complaint: seal broken',
          'Customer complaint: foreign particles',
          'Customer complaint: incorrect packaging',
          'Customer complaint: damaged product',
        ],
      },
    ],
  },
];

export function getPillar(id: string | undefined): Pillar | undefined {
  return PILLARS.find((p) => p.id === id);
}

export function guidanceTotals() {
  return {
    totalReasons: PILLARS.reduce((s, p) => s + p.groups.reduce((a, g) => a + g.items.length, 0), 0),
    totalCategories: PILLARS.reduce((s, p) => s + p.groups.length, 0),
  };
}

export function matchesQuery(text: string, q: string) {
  return text.toLowerCase().includes(q);
}
