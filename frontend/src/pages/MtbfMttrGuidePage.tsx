import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, BookOpen, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import { PageHeader } from '../components/ui';
import {
  METRIC_COMBOS,
  MTBF_BANDS,
  MTBF_TARGET_MINS,
  MTTR_BANDS,
  MTTR_TARGET_MINS,
  OEE_LINK,
} from '../lib/mtbfMttrGuide';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel p-5">
      <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
        {title}
      </h2>
      <div className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
        {children}
      </div>
    </section>
  );
}

function FormulaBox({ title, formula, example }: { title: string; formula: string; example: string }) {
  return (
    <div className="rounded-lg border px-4 py-3" style={{ borderColor: 'var(--border)', background: 'var(--panel-2)' }}>
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
        {title}
      </div>
      <div className="mt-1 font-mono text-sm font-semibold" style={{ color: 'var(--text)' }}>
        {formula}
      </div>
      <div className="mt-2 text-xs leading-snug" style={{ color: 'var(--muted)' }}>
        {example}
      </div>
    </div>
  );
}

export default function MtbfMttrGuidePage() {
  return (
    <div>
      <PageHeader
        title="MTBF & MTTR Guide"
        subtitle="Maintenance reliability metrics for production & facility managers"
      />

      <div className="panel mb-5 flex flex-wrap items-start gap-4 p-5">
        <span className="icon-box shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          <BookOpen size={22} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1 text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
          <p>
            <strong style={{ color: 'var(--text)' }}>MTBF</strong> and <strong style={{ color: 'var(--text)' }}>MTTR</strong>{' '}
            turn breakdown logs into performance numbers. Track them on critical assets (Filler, Capper, Labeler) to
            benchmark reliability, justify maintenance spend, and measure improvement after PM or RCA actions.
          </p>
          <p className="mt-2">
            This app calculates both automatically from{' '}
            <Link to="/breakdown-entries" className="underline" style={{ color: 'var(--accent)' }}>
              Breakdown Entries
            </Link>{' '}
            on the{' '}
            <Link to="/maintenance-reliability" className="underline" style={{ color: 'var(--accent)' }}>
              Maintenance Dashboard
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <div className="panel p-5">
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>
            <ArrowUp size={18} style={{ color: 'var(--band-excellent)' }} />
            MTBF — Mean Time Between Failures
          </div>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm" style={{ color: 'var(--muted)' }}>
            <li>Average <strong style={{ color: 'var(--text)' }}>running time between breakdowns</strong></li>
            <li>Measures <strong style={{ color: 'var(--text)' }}>equipment reliability</strong> and PM effectiveness</li>
            <li><strong style={{ color: 'var(--text)' }}>Higher MTBF = better</strong> — machine runs longer without failing</li>
            <li>Rising MTBF → PM is working · Falling MTBF → end-of-life or PM gap</li>
          </ul>
        </div>

        <div className="panel p-5">
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>
            <ArrowDown size={18} style={{ color: 'var(--band-good)' }} />
            MTTR — Mean Time To Repair
          </div>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm" style={{ color: 'var(--muted)' }}>
            <li>Average time from <strong style={{ color: 'var(--text)' }}>breakdown start to restore</strong></li>
            <li>Measures <strong style={{ color: 'var(--text)' }}>repair speed</strong> — parts, skills, response</li>
            <li><strong style={{ color: 'var(--text)' }}>Lower MTTR = better</strong> — faster recovery to production</li>
            <li>High MTTR often means missing spares, skills, or work instructions</li>
          </ul>
        </div>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <FormulaBox
          title="MTBF formula"
          formula="MTBF = Operating Time ÷ Number of Failures"
          example="Planned production 600 min − Breakdown 90 min = 510 min operating · 3 failures → MTBF = 170 min"
        />
        <FormulaBox
          title="MTTR formula"
          formula="MTTR = Total Repair Time ÷ Number of Repairs"
          example="Breakdowns 20 + 30 + 40 min = 90 min total · 3 repairs → MTTR = 30 min"
        />
      </div>

      <Section title="Plant targets (Nakshatra)">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong style={{ color: 'var(--text)' }}>MTBF target:</strong> ≥ {MTBF_TARGET_MINS} min between failures
          </li>
          <li>
            <strong style={{ color: 'var(--text)' }}>MTTR target:</strong> ≤ {MTTR_TARGET_MINS} min average repair time
          </li>
          <li>
            <strong style={{ color: 'var(--text)' }}>Availability:</strong> {OEE_LINK.availability}
          </li>
          <li>
            <strong style={{ color: 'var(--text)' }}>OEE link:</strong> {OEE_LINK.formula} — {OEE_LINK.note}
          </li>
        </ul>
      </Section>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Section title="MTTR rating bands">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[20rem] text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                  <th className="py-2 pr-3">Range</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {MTTR_BANDS.map((row) => (
                  <tr key={row.range} className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-2 pr-3 tabular-nums">{row.range}</td>
                    <td className="py-2 pr-3">{row.label}</td>
                    <td className="py-2">{row.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="MTBF rating bands">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[20rem] text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                  <th className="py-2 pr-3">Range</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {MTBF_BANDS.map((row) => (
                  <tr key={row.range} className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-2 pr-3 tabular-nums">{row.range}</td>
                    <td className="py-2 pr-3">{row.label}</td>
                    <td className="py-2">{row.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      <Section title="Using MTBF, MTTR & OEE together">
        <ul className="space-y-3">
          {METRIC_COMBOS.map((c) => (
            <li key={c.pattern} className="rounded-lg border px-4 py-3" style={{ borderColor: 'var(--border)' }}>
              <div className="font-semibold" style={{ color: 'var(--text)' }}>
                {c.pattern}
              </div>
              <div className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                {c.meaning}
              </div>
              <div className="mt-1.5">{c.action}</div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Improvement loop in this software">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <Link to="/breakdown-entries" className="underline" style={{ color: 'var(--accent)' }}>
              Log breakdown
            </Link>{' '}
            — date, machine, reason, failure mode, technician, corrective action
          </li>
          <li>
            Track on{' '}
            <Link to="/maintenance-reliability" className="underline" style={{ color: 'var(--accent)' }}>
              Maintenance Dashboard
            </Link>{' '}
            — MTBF, MTTR, Pareto, repeat failures
          </li>
          <li>RCA / 5 Why → root cause → preventive action → update status to Verified / Closed</li>
          <li>Compare MTBF/MTTR trend before vs after improvement</li>
        </ol>
      </Section>

      <div className="panel mt-5 flex items-start gap-3 p-4 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
        <Wrench size={16} className="mt-0.5 shrink-0" />
        <p>
          Reference: industry maintenance metrics guide (OxMaint / facility management). Facilities that consistently
          track MTTR & MTBF on critical assets typically reduce unplanned downtime significantly within 12–18 months
          compared to calendar-only PM.
        </p>
      </div>
    </div>
  );
}
