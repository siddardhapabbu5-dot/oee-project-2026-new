import { useMemo, useState } from 'react';
import { BookOpen, Gauge, PackageSearch, TimerOff } from 'lucide-react';
import { PageHeader } from '../components/ui';

type ReasonGroup = {
  title: string;
  items: string[];
};

type Pillar = {
  id: 'availability' | 'performance' | 'quality';
  label: string;
  short: string;
  formula: string;
  meaning: string;
  icon: typeof Gauge;
  tone: string;
  soft: string;
  groups: ReasonGroup[];
};

const PILLARS: Pillar[] = [
  {
    id: 'availability',
    label: 'Availability',
    short: 'A',
    formula: 'Run Time ÷ Planned Production Time',
    meaning:
      'Time the line was actually running versus time it was scheduled to run. Downtime, planned stops, utility failures, and staffing gaps reduce Availability.',
    icon: TimerOff,
    tone: 'var(--danger)',
    soft: 'color-mix(in oklab, var(--danger) 12%, transparent)',
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
    tone: 'var(--warning)',
    soft: 'color-mix(in oklab, var(--warning) 14%, transparent)',
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
        items: ['Product Change Stabilization', 'Temperature Adjustment', 'Fill level hunting', 'Foam control delay'],
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
    tone: 'var(--info)',
    soft: 'color-mix(in oklab, var(--info) 12%, transparent)',
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
          'Customer complaint related: bottle leakage',
          'Customer complaint related: seal broken',
          'Customer complaint related: foreign particles',
          'Customer complaint related: incorrect packaging',
          'Customer complaint related: damaged product',
        ],
      },
    ],
  },
];

function matchesQuery(text: string, q: string) {
  return text.toLowerCase().includes(q);
}

export default function OeeGuidancePage() {
  const [active, setActive] = useState<Pillar['id']>('availability');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const pillar = PILLARS.find((p) => p.id === active)!;
  const PillarIcon = pillar.icon;

  const filtered = useMemo(() => {
    if (!q) {
      return {
        groups: pillar.groups,
        reasonCount: pillar.groups.reduce((s, g) => s + g.items.length, 0),
      };
    }

    const groups = pillar.groups
      .map((g) => ({
        title: g.title,
        items: g.items.filter((item) => matchesQuery(item, q) || matchesQuery(g.title, q)),
      }))
      .filter((g) => g.items.length > 0 || matchesQuery(g.title, q));

    return {
      groups,
      reasonCount: groups.reduce((s, g) => s + g.items.length, 0),
    };
  }, [pillar, q]);

  const totalReasons = PILLARS.reduce(
    (s, p) => s + p.groups.reduce((a, g) => a + g.items.length, 0),
    0,
  );
  const totalCategories = PILLARS.reduce((s, p) => s + p.groups.length, 0);

  return (
    <div>
      <PageHeader
        title="OEE Guidance"
        subtitle="Standard categories & loss reasons for bottled water lines — Availability × Performance × Quality"
      />

      <div className="panel mb-5 p-5">
        <div className="flex flex-wrap items-start gap-4">
          <span
            className="icon-box shrink-0"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <BookOpen size={22} strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold" style={{ color: 'var(--text)' }}>
              OEE = Availability × Performance × Quality
            </div>
            <p className="mt-1.5 max-w-3xl text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
              Use these standard categories when classifying downtime, speed loss, and rejects. Consistent
              coding helps management see where loss is concentrated on filling, capping, labelling, and packing
              lines.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs" style={{ color: 'var(--muted)' }}>
              <span className="rounded-md px-2.5 py-1" style={{ background: 'var(--accent-soft)' }}>
                {totalCategories} categories
              </span>
              <span className="rounded-md px-2.5 py-1" style={{ background: 'var(--accent-soft)' }}>
                {totalReasons} detailed reasons
              </span>
              <span className="rounded-md px-2.5 py-1" style={{ background: 'var(--border)' }}>
                Bottled water production
              </span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {PILLARS.map((p) => {
            const count = p.groups.reduce((s, g) => s + g.items.length, 0);
            const Icon = p.icon;
            const selected = active === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setActive(p.id)}
                className="rounded-xl border p-4 text-left transition"
                style={{
                  borderColor: selected ? p.tone : 'var(--border)',
                  background: selected ? p.soft : 'var(--panel)',
                  boxShadow: selected ? `inset 0 0 0 1px ${p.tone}` : undefined,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    <Icon size={18} style={{ color: p.tone }} />
                    {p.label}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
                    style={{ background: p.soft, color: p.tone }}
                  >
                    {p.short}
                  </span>
                </div>
                <div className="mt-2 text-xs leading-snug" style={{ color: 'var(--muted)' }}>
                  {p.formula}
                </div>
                <div className="mt-2 text-xs font-medium tabular-nums" style={{ color: p.tone }}>
                  {p.groups.length} categories · {count} reasons
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel mb-4 flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-[220px] flex-1 text-sm">
          <span className="mb-1.5 block font-medium" style={{ color: 'var(--muted)' }}>
            Search categories / reasons
          </span>
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. cap, PLC, speed, TDS…"
          />
        </label>
        <div className="pb-2 text-sm" style={{ color: 'var(--muted)' }}>
          Showing <strong style={{ color: 'var(--text)' }}>{filtered.groups.length}</strong> categories ·{' '}
          <strong style={{ color: 'var(--text)' }}>{filtered.reasonCount}</strong> reasons in{' '}
          <strong style={{ color: 'var(--text)' }}>{pillar.label}</strong>
        </div>
      </div>

      <div className="panel mb-5 p-5">
        <div className="flex flex-wrap items-start gap-3">
          <span className="icon-box" style={{ background: pillar.soft, color: pillar.tone }}>
            <PillarIcon size={20} strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
              {pillar.label} categories
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
              {pillar.meaning}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {pillar.groups.map((g, i) => (
            <div
              key={g.title}
              className="rounded-lg border px-3 py-2.5 text-sm font-medium"
              style={{ borderColor: 'var(--border)', color: 'var(--text)', background: pillar.soft }}
            >
              <span className="mr-1.5 tabular-nums" style={{ color: pillar.tone }}>
                {i + 1}.
              </span>
              {g.title}
            </div>
          ))}
        </div>
      </div>

      {filtered.groups.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.groups.map((g, gi) => (
            <div key={g.title} className="panel p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  <span className="mr-2 tabular-nums" style={{ color: pillar.tone }}>
                    {gi + 1}.
                  </span>
                  {g.title}
                </h3>
                <span className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
                  {g.items.length} reasons
                </span>
              </div>
              <ul className="space-y-1.5">
                {g.items.map((item) => (
                  <li key={item} className="flex gap-2 text-sm leading-snug" style={{ color: 'var(--text)' }}>
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: pillar.tone }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
          No categories or reasons match “{query}”. Try another keyword.
        </div>
      )}

      <div className="panel mt-5 p-5 text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
        <div className="font-semibold" style={{ color: 'var(--text)' }}>
          How management should use this
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Pick the <strong style={{ color: 'var(--text)' }}>pillar</strong> first (A / P / Q), then the{' '}
            <strong style={{ color: 'var(--text)' }}>category</strong>, then the detailed reason.
          </li>
          <li>
            <strong style={{ color: 'var(--text)' }}>Availability</strong> → full stops / downtime (planned or
            unplanned).
          </li>
          <li>
            <strong style={{ color: 'var(--text)' }}>Performance</strong> → line running but below ideal speed or with
            minor stops.
          </li>
          <li>
            <strong style={{ color: 'var(--text)' }}>Quality</strong> → rejects, rework, startup scrap, and QA
            rejections.
          </li>
        </ul>
      </div>
    </div>
  );
}
