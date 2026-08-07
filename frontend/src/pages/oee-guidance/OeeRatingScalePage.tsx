import type { ReactNode } from 'react';
import {
  BAND_EMOJI,
  BAND_ORDER,
  METRIC_BAND_RANGES,
  METRIC_ROWS,
} from '../../lib/oeeGuidanceData';
import {
  DOWNTIME_BAND_ROWS,
  EXAMPLE_KPI_STRIP,
  LOSS_CATEGORY_COLORS,
  METRIC_BAND_LABEL,
  METRIC_BAND_USAGE,
  exampleKpiColor,
} from '../../lib/metricBands';

function LegendTable({
  title,
  subtitle,
  headers,
  rows,
}: {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: Array<Array<ReactNode>>;
}) {
  return (
    <div className="panel overflow-hidden p-0">
      <div className="border-b px-4 py-3 sm:px-5" style={{ borderColor: 'var(--border)' }}>
        <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          {title}
        </div>
        {subtitle ? (
          <div className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[20rem] text-left text-sm">
          <thead>
            <tr style={{ background: 'var(--table-head)', color: 'var(--table-head-text)' }}>
              {headers.map((h) => (
                <th key={h} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((cells, i) => (
              <tr
                key={i}
                className="border-t"
                style={{ borderColor: 'var(--border)', background: i % 2 ? 'var(--panel-2)' : 'var(--panel)' }}
              >
                {cells.map((cell, j) => (
                  <td key={j} className="px-4 py-2.5 align-middle">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function OeeRatingScalePage() {
  return (
    <div className="space-y-5">
      <LegendTable
        title="Status colour scale"
        subtitle="Used across dashboards for OEE, Availability, Performance, Quality & Achievement"
        headers={['Status', 'Usage']}
        rows={BAND_ORDER.map((b) => [
          <span key="s" className="inline-flex items-center gap-2 font-semibold" style={{ color: `var(--band-${b})` }}>
            <span
              className="inline-block h-3.5 w-3.5 shrink-0 rounded-sm"
              style={{ background: `var(--band-${b})` }}
              aria-hidden
            />
            {BAND_EMOJI[b]} {METRIC_BAND_LABEL[b]}
          </span>,
          <span key="u" style={{ color: 'var(--muted)' }}>
            {METRIC_BAND_USAGE[b]}
          </span>,
        ])}
      />

      <div className="panel p-4 sm:p-5">
        <div className="mb-4">
          <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            KPI threshold bands
          </div>
          <div className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
            Percentage ranges that map each KPI to the status colours above
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {METRIC_ROWS.map((row) => (
            <div
              key={row.kind}
              className="rounded-xl border p-3.5"
              style={{ borderColor: 'var(--border)', background: 'var(--panel-2)' }}
            >
              <div className="mb-3 text-sm font-semibold" style={{ color: 'var(--text)' }}>
                {row.label}
              </div>
              <div className="mb-2 flex h-2 overflow-hidden rounded-full">
                {BAND_ORDER.map((b) => (
                  <div key={b} className="flex-1" style={{ background: `var(--band-${b})` }} title={METRIC_BAND_LABEL[b]} />
                ))}
              </div>
              <div className="space-y-1.5">
                {BAND_ORDER.map((b) => (
                  <div key={b} className="flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: `var(--band-${b})` }}>
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: `var(--band-${b})` }}
                        aria-hidden
                      />
                      {METRIC_BAND_LABEL[b]}
                    </span>
                    <span className="tabular-nums font-semibold" style={{ color: 'var(--text)' }}>
                      {METRIC_BAND_RANGES[row.kind][b]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <LegendTable
        title="Downtime colour scale"
        subtitle="Total downtime minutes on the dashboard are coloured by duration"
        headers={['Downtime', 'Colour']}
        rows={DOWNTIME_BAND_ROWS.map((r) => [
          <span key="r" className="font-semibold tabular-nums" style={{ color: 'var(--text)' }}>
            {r.range}
          </span>,
          <span key="c" className="inline-flex items-center gap-2 font-medium" style={{ color: `var(--band-${r.band})` }}>
            <span className="inline-block h-3.5 w-3.5 rounded-sm" style={{ background: `var(--band-${r.band})` }} />
            {r.emoji} {METRIC_BAND_LABEL[r.band]}
          </span>,
        ])}
      />

      <LegendTable
        title="Category colours"
        subtitle="Pillars (A / P / Q) and Availability loss categories — used in guidance and downtime charts"
        headers={['Category', 'Colour']}
        rows={LOSS_CATEGORY_COLORS.map((r) => [
          <span key="n" className="font-medium" style={{ color: 'var(--text)' }}>
            {r.name}
          </span>,
          <span key="c" className="inline-flex items-center gap-2 font-medium" style={{ color: r.cssVar }}>
            <span className="inline-block h-3.5 w-3.5 rounded-sm" style={{ background: r.cssVar }} />
            {r.emoji}
          </span>,
        ])}
      />

      <div className="panel p-4 sm:p-5">
        <div className="mb-3">
          <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Example KPI colouring
          </div>
          <div className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
            How values appear on the dashboard when the colour rules are applied
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {EXAMPLE_KPI_STRIP.map((row) => {
            const color = exampleKpiColor(row);
            return (
              <div
                key={row.label}
                className="rounded-xl border px-3 py-3"
                style={{
                  borderColor: 'var(--border)',
                  background: `color-mix(in oklab, ${color} 12%, transparent)`,
                }}
              >
                <div className="text-[11px] font-medium" style={{ color: 'var(--muted)' }}>
                  {row.label}
                </div>
                <div className="mt-1 text-xl font-semibold tabular-nums" style={{ color }}>
                  {row.value}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
