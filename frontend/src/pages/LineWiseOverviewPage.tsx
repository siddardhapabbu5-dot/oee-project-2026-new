import { useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FilterX } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import api, { type ApiResponse } from '../lib/api';
import { ChartValueLabels } from '../components/chartLabels';
import { ChartCard, Field, KpiCard, LoadingBlock, PageHeader, Badge } from '../components/ui';
import { metricColor, metricTone } from '../lib/metricBands';

type LineRow = {
  lineId: string;
  lineCode: string;
  lineName: string;
  plantName: string;
  status: string;
  planCount: number;
  plannedCases: number;
  actualCases: number;
  goodCases: number;
  rejectCases: number;
  productionLoss: number;
  achievement: number;
  capacityUtilization: number;
  downtimeMins: number;
  plannedProductionTimeMins: number;
  runTimeMins: number;
  availability: number;
  performance: number;
  quality: number;
  oee: number;
};

type LineWisePayload = {
  reportDate: string;
  from: string;
  to: string;
  formula: {
    availability: string;
    performance: string;
    quality: string;
    oee: string;
  };
  totals: {
    lineCount: number;
    activeLines: number;
    plannedCases: number;
    actualCases: number;
    goodCases: number;
    rejectCases: number;
    productionLoss: number;
    achievement: number;
    capacityUtilization: number;
    downtimeMins: number;
    plannedProductionTimeMins: number;
    runTimeMins: number;
    availability: number;
    performance: number;
    quality: number;
    oee: number;
  };
  lines: LineRow[];
  charts: {
    oeeByLine: Array<{ line: string; oee: number; availability: number; performance: number; quality: number }>;
    planVsActual: Array<{ line: string; planned: number; actual: number }>;
    downtimeByLine: Array<{ line: string; downtime: number }>;
    downtimeTrend: Array<{ date: string; downtime: number; planned: number; actual: number; oee: number }>;
    weeklyTrend: Array<{ week: string; downtime: number; planned: number; actual: number; oee: number }>;
  };
};

function statusTone(status: string): 'good' | 'warn' | 'bad' | 'default' {
  if (status === 'Completed' || status === 'Running') return 'good';
  if (status === 'Down') return 'bad';
  if (status === 'Idle') return 'warn';
  return 'default';
}

export default function LineWiseOverviewPage() {
  const localYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const today = () => localYmd(new Date());
  const monthStart = () => {
    const d = new Date();
    return localYmd(new Date(d.getFullYear(), d.getMonth(), 1));
  };
  const [from, setFrom] = useState(() => monthStart());
  const [to, setTo] = useState(() => today());

  const rangeValid = Boolean(from && to && from <= to);

  const clearFilters = () => {
    setFrom(monthStart());
    setTo(today());
  };

  const setTodayRange = () => {
    const tdy = today();
    setFrom(tdy);
    setTo(tdy);
  };

  const FILTER_CONTROL = 'input box-border h-10';

  function DateFilters({
    summary,
    showActions = true,
  }: {
    summary?: ReactNode;
    showActions?: boolean;
  }) {
    return (
      <div className="panel mb-4 p-4">
        <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-[1fr_1fr_auto_auto_minmax(0,1.4fr)]">
          <Field label="From Date" className="mb-0">
            <input
              className={FILTER_CONTROL}
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => {
                const v = e.target.value;
                setFrom(v);
                if (to && v > to) setTo(v);
              }}
            />
          </Field>
          <Field label="To Date" className="mb-0">
            <input
              className={FILTER_CONTROL}
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => {
                const v = e.target.value;
                setTo(v);
                if (from && v < from) setFrom(v);
              }}
            />
          </Field>
          {showActions ? (
            <Field label="Today" className="mb-0">
              <button
                type="button"
                className={`${FILTER_CONTROL} cursor-pointer px-3 font-medium`}
                onClick={setTodayRange}
              >
                Today
              </button>
            </Field>
          ) : null}
          {showActions ? (
            <Field label="Clear" className="mb-0 w-10">
              <button
                type="button"
                className={`${FILTER_CONTROL} inline-flex w-10 shrink-0 cursor-pointer items-center justify-center px-0`}
                onClick={clearFilters}
                title="Reset to month start → today"
                aria-label="Clear filters"
              >
                <FilterX size={18} strokeWidth={1.75} />
              </button>
            </Field>
          ) : null}
          {summary ? (
            <div className="col-span-2 flex flex-col sm:col-span-1">
              <span className="mb-1.5 block text-sm font-medium opacity-0 select-none" aria-hidden>
                ·
              </span>
              <div className="flex min-h-10 items-center text-sm" style={{ color: 'var(--muted)' }}>
                {summary}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const overview = useQuery({
    queryKey: ['line-wise-overview', from, to],
    enabled: rangeValid,
    queryFn: async () =>
      (
        await api.get<ApiResponse<LineWisePayload>>('/dashboard/line-wise', {
          params: { from, to },
        })
      ).data.data,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  if (!rangeValid) {
    return (
      <div>
        <PageHeader title="Line-wise Overview" subtitle="Compare every line — planned vs actual, downtime, and OEE (A × P × Q)" />
        <DateFilters />
        <div className="panel p-6 text-sm" style={{ color: 'var(--muted)' }}>
          From date must be on or before To date.
        </div>
      </div>
    );
  }
  if (overview.isLoading && !overview.data) {
    return (
      <div>
        <PageHeader title="Line-wise Overview" subtitle="Compare every line — planned vs actual, downtime, and OEE (A × P × Q)" />
        <DateFilters />
        <LoadingBlock />
      </div>
    );
  }
  if (overview.isError || !overview.data) {
    return (
      <div>
        <PageHeader title="Line-wise Overview" subtitle="Compare every line — planned vs actual, downtime, and OEE (A × P × Q)" />
        <DateFilters />
        <div className="panel p-6 text-sm" style={{ color: 'var(--muted)' }}>
          Failed to load line-wise overview. Check that the API is running.
        </div>
      </div>
    );
  }

  const d = overview.data;
  const t = d.totals;
  const lineRows = d.lines;

  return (
    <div>
      <PageHeader
        title="Line-wise Overview"
        subtitle="Compare every line — planned vs actual, downtime, and OEE (A × P × Q)"
      />

      <DateFilters
        summary={
          <>
            Line-wise for <strong style={{ color: 'var(--text)' }}>{d.from}</strong>
            {' → '}
            <strong style={{ color: 'var(--text)' }}>{d.to}</strong>
            {overview.isFetching ? ' · updating…' : ''}
          </>
        }
      />

      <div className="panel mb-4 p-4 text-sm" style={{ color: 'var(--muted)' }}>
        <div className="font-semibold" style={{ color: 'var(--text)' }}>
          Analysis formulas (line-wise)
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Availability = {d.formula.availability}</li>
          <li>Performance = {d.formula.performance}</li>
          <li>Quality = {d.formula.quality}</li>
          <li>
            Plant OEE = {t.availability}% × {t.performance}% × {t.quality}% ={' '}
            <strong style={{ color: 'var(--text)' }}>{t.oee}%</strong>
          </li>
        </ul>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
        <KpiCard label="Plant OEE" value={`${t.oee}%`} tone={metricTone('oee', t.oee)} hint="A × P × Q" />
        <KpiCard
          label="Availability"
          value={`${t.availability}%`}
          tone={metricTone('availability', t.availability)}
        />
        <KpiCard
          label="Performance"
          value={`${t.performance}%`}
          tone={metricTone('performance', t.performance)}
        />
        <KpiCard label="Quality" value={`${t.quality}%`} tone={metricTone('quality', t.quality)} />
        <KpiCard label="Planned Cases" value={t.plannedCases.toLocaleString()} />
        <KpiCard label="Actual Cases" value={t.actualCases.toLocaleString()} />
        <KpiCard
          label="Achievement %"
          value={`${t.achievement}%`}
          tone={metricTone('achievement', t.achievement)}
        />
        <KpiCard label="Downtime (min)" value={Math.round(t.downtimeMins).toLocaleString()} />
        <KpiCard label="Run Time (min)" value={Math.round(t.runTimeMins).toLocaleString()} />
        <KpiCard label="Capacity Util." value={`${t.capacityUtilization}%`} />
        <KpiCard label="Good / Reject" value={`${t.goodCases} / ${t.rejectCases}`} />
        <KpiCard label="Production Loss" value={t.productionLoss.toLocaleString()} tone="warn" />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <ChartCard title="Line-wise OEE (A / P / Q)">
          <ResponsiveContainer>
            <BarChart data={d.charts.oeeByLine} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="line" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis domain={[0, 100]} tick={{ fill: '#64748b' }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="oee" name="OEE %" fill="var(--chart-1)" radius={[4, 4, 0, 0]}>
                <ChartValueLabels suffix="%" />
              </Bar>
              <Bar dataKey="availability" name="A %" fill="var(--chart-2)" radius={[4, 4, 0, 0]}>
                <ChartValueLabels suffix="%" />
              </Bar>
              <Bar dataKey="performance" name="P %" fill="var(--chart-3)" radius={[4, 4, 0, 0]}>
                <ChartValueLabels suffix="%" />
              </Bar>
              <Bar dataKey="quality" name="Q %" fill="var(--chart-4)" radius={[4, 4, 0, 0]}>
                <ChartValueLabels suffix="%" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Line-wise Plan vs Actual">
          <ResponsiveContainer>
            <BarChart data={d.charts.planVsActual} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="line" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fill: '#64748b' }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="planned" name="Planned" fill="var(--chart-2)" radius={[4, 4, 0, 0]}>
                <ChartValueLabels />
              </Bar>
              <Bar dataKey="actual" name="Actual" fill="var(--chart-1)" radius={[4, 4, 0, 0]}>
                <ChartValueLabels />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Daily Downtime Trend (min)"
          subtitle="How downtime changes day by day in the selected range — this is the trend view."
        >
          <ResponsiveContainer>
            <LineChart data={d.charts.downtimeTrend ?? []} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fill: '#64748b' }} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="downtime"
                name="Downtime (min)"
                stroke="var(--chart-5)"
                strokeWidth={2}
                dot={{ r: 3 }}
              >
                <ChartValueLabels />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard
          title="Weekly Downtime Trend (min)"
          subtitle="Week-01 = days 1–7, Week-02 = 8–14, Week-03 = 15–21, Week-04 = 22–end of month."
        >
          <ResponsiveContainer>
            <BarChart data={d.charts.weeklyTrend ?? []} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fill: '#64748b' }} />
              <Tooltip />
              <Bar dataKey="downtime" name="Downtime (min)" fill="var(--chart-5)" radius={[4, 4, 0, 0]}>
                <ChartValueLabels />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Downtime by Line (total min)"
          subtitle="Comparison across lines for the whole date range — not a time trend. One bar = total DT for that line."
        >
          <ResponsiveContainer>
            <BarChart data={d.charts.downtimeByLine} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="line" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fill: '#64748b' }} />
              <Tooltip />
              <Bar dataKey="downtime" name="Total DT (min)" fill="var(--chart-5)" radius={[4, 4, 0, 0]}>
                <ChartValueLabels />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard
          title="Weekly OEE Trend (%)"
          subtitle="Plant OEE by calendar week in the selected range."
        >
          <ResponsiveContainer>
            <LineChart data={d.charts.weeklyTrend ?? []} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis domain={[0, 100]} tick={{ fill: '#64748b' }} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="oee"
                name="OEE %"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={{ r: 3 }}
              >
                <ChartValueLabels suffix="%" />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="mb-2 text-sm font-semibold">Line-wise detail ({lineRows.length} lines)</div>
      <div className="table-wrap panel">
        <table className="data">
          <thead>
            <tr>
              <th>Line</th>
              <th>Plant</th>
              <th>Status</th>
              <th>Plans</th>
              <th>Planned</th>
              <th>Actual</th>
              <th>Ach %</th>
              <th>Good</th>
              <th>Reject</th>
              <th>DT (min)</th>
              <th>Run (min)</th>
              <th>A %</th>
              <th>P %</th>
              <th>Q %</th>
              <th>OEE %</th>
            </tr>
          </thead>
          <tbody>
            {lineRows.length === 0 ? (
              <tr>
                <td colSpan={15} className="py-8 text-center" style={{ color: 'var(--muted)' }}>
                  No line data for {from} → {to}
                </td>
              </tr>
            ) : (
              lineRows.map((l) => (
                <tr key={l.lineId}>
                  <td>
                    <div className="font-medium">{l.lineCode || l.lineName}</div>
                    <div className="text-xs" style={{ color: 'var(--muted)' }}>
                      {l.lineName}
                    </div>
                  </td>
                  <td>{l.plantName}</td>
                  <td>
                    <Badge tone={statusTone(l.status)}>{l.status}</Badge>
                  </td>
                  <td>{l.planCount}</td>
                  <td>{l.plannedCases.toLocaleString()}</td>
                  <td>{l.actualCases.toLocaleString()}</td>
                  <td style={{ color: metricColor('achievement', l.achievement) }}>{l.achievement}%</td>
                  <td>{l.goodCases.toLocaleString()}</td>
                  <td>{l.rejectCases.toLocaleString()}</td>
                  <td>{Math.round(l.downtimeMins)}</td>
                  <td>{Math.round(l.runTimeMins)}</td>
                  <td style={{ color: metricColor('availability', l.availability) }}>{l.availability}%</td>
                  <td style={{ color: metricColor('performance', l.performance) }}>{l.performance}%</td>
                  <td style={{ color: metricColor('quality', l.quality) }}>{l.quality}%</td>
                  <td className="font-semibold" style={{ color: metricColor('oee', l.oee) }}>
                    {l.oee}%
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
