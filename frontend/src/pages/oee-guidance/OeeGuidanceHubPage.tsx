import { Link } from 'react-router-dom';
import { BookOpen, Scale } from 'lucide-react';
import { guidanceTotals, PILLARS } from '../../lib/oeeGuidanceData';

export default function OeeGuidanceHubPage() {
  const { totalCategories, totalReasons } = guidanceTotals();

  return (
    <div>
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
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Link
          to="/oee-guidance/rating-scale"
          className="panel block p-4 transition hover:opacity-95"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>
            <Scale size={18} style={{ color: 'var(--accent)' }} />
            Rating scale
          </div>
          <p className="mt-2 text-xs leading-snug" style={{ color: 'var(--muted)' }}>
            Colour bands for OEE, A, P, Q & Achievement used across dashboards.
          </p>
        </Link>

        {PILLARS.map((p) => {
          const count = p.groups.reduce((s, g) => s + g.items.length, 0);
          const Icon = p.icon;
          return (
            <Link
              key={p.id}
              to={`/oee-guidance/${p.id}`}
              className="panel block p-4 transition hover:opacity-95"
              style={{ borderColor: 'var(--border)' }}
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
            </Link>
          );
        })}
      </div>

      <div className="panel p-5 text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
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
