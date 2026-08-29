import { useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Lightbulb } from 'lucide-react';
import { CopyCardButton } from './ui';
import {
  buildOeeImprovement,
  type ImprovementCharts,
  type ImprovementKpis,
  type PillarId,
} from '../lib/oeeImprovement';
import { metricColor, PILLAR_COLOR } from '../lib/metricBands';

const PILLAR_HREF: Record<PillarId, string> = {
  availability: '/oee-guidance/availability',
  performance: '/oee-guidance/performance',
  quality: '/oee-guidance/quality',
};

export function OeeImprovementPanel({
  kpis,
  charts,
}: {
  kpis: ImprovementKpis;
  charts?: ImprovementCharts;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const analysis = useMemo(() => buildOeeImprovement(kpis, charts), [kpis, charts]);
  const maxGain = Math.max(0.01, ...analysis.pillars.map((p) => p.oeeGain));

  if (!analysis.hasData) return null;

  return (
    <section
      ref={cardRef}
      className="panel group relative mt-3 mb-3 p-4"
      aria-label="How to increase OEE"
    >
      <CopyCardButton
        targetRef={cardRef}
        title="How to increase OEE"
        className="absolute right-1.5 top-1.5 z-10 opacity-70 transition-opacity group-hover:opacity-100"
      />

      <div className="flex flex-wrap items-start gap-3 pr-8">
        <span
          className="icon-box shrink-0"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          <Lightbulb size={20} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
            Management view · from production entries
          </div>
          <h2 className="mt-0.5 text-base font-semibold" style={{ color: 'var(--text)' }}>
            {analysis.headline}
          </h2>
          <p className="mt-1.5 max-w-4xl text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
            {analysis.summary}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
            If A, P and Q all hit Excellent
          </div>
          <div className="text-lg font-semibold tabular-nums" style={{ color: metricColor('oee', analysis.oeeIfAllExcellent) }}>
            {analysis.oeeIfAllExcellent}%
          </div>
          <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
            now {analysis.currentOee}%
            {analysis.oeeIfAllExcellent > analysis.currentOee
              ? ` · +${(analysis.oeeIfAllExcellent - analysis.currentOee).toFixed(1)} pts`
              : ''}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {analysis.pillars.map((pillar) => {
          const isConstraint = analysis.constraint === pillar.id;
          return (
            <div
              key={pillar.id}
              className="rounded-lg px-3 py-2.5"
              style={{
                background: isConstraint
                  ? `color-mix(in oklab, ${PILLAR_COLOR[pillar.id]} 12%, transparent)`
                  : 'var(--panel-2)',
                boxShadow: `inset 3px 0 0 ${PILLAR_COLOR[pillar.id]}`,
              }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
                  {pillar.short} · {pillar.label}
                </span>
                {isConstraint ? (
                  <span className="text-[10px] font-semibold uppercase" style={{ color: PILLAR_COLOR[pillar.id] }}>
                    Fix first
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-lg font-semibold tabular-nums" style={{ color: metricColor(pillar.id, pillar.value) }}>
                  {pillar.value}%
                </span>
                <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
                  target {pillar.target}% · {pillar.band}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (pillar.oeeGain / maxGain) * 100)}%`,
                    background: PILLAR_COLOR[pillar.id],
                  }}
                />
              </div>
              <div className="mt-1.5 text-[11px] leading-snug" style={{ color: 'var(--muted)' }}>
                {pillar.oeeGain > 0.05 ? (
                  <>
                    +{pillar.oeeGain.toFixed(1)} OEE pts if Excellent
                    {pillar.casesRecoverable > 0
                      ? ` · ~${pillar.casesRecoverable.toLocaleString()} ${pillar.casesLabel}`
                      : ''}
                  </>
                ) : (
                  pillar.bandHint
                )}
              </div>
              <Link
                to={PILLAR_HREF[pillar.id]}
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium"
                style={{ color: PILLAR_COLOR[pillar.id] }}
              >
                Why this pillar <ArrowRight size={12} />
              </Link>
            </div>
          );
        })}
      </div>

      {analysis.actions.length > 0 ? (
        <ol className="mt-4 grid gap-2 lg:grid-cols-3">
          {analysis.actions.map((action, i) => (
            <li
              key={action.pillar}
              className="rounded-lg border p-3"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
                  {i + 1}. {action.title}
                </span>
                <span className="text-[11px] font-semibold tabular-nums" style={{ color: PILLAR_COLOR[action.pillar] }}>
                  +{action.oeeGain.toFixed(1)} pts
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                {action.why}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--text)' }}>
                {action.doNext}
              </p>
              <Link
                to={action.href}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium"
                style={{ color: 'var(--accent)' }}
              >
                {action.hrefLabel} <ArrowRight size={12} />
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
