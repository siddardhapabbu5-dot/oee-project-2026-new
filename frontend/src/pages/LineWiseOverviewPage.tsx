import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import api, { type ApiResponse } from '../lib/api';
import { ChartCard, Field, KpiCard, LoadingBlock, PageHeader, Badge } from '../components/ui';

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
  };
};

function statusTone(status: string): 'good' | 'warn' | 'bad' | 'default' {
  if (status === 'Completed' || status === 'Running') return 'good';
  if (status === 'Down') return 'bad';
  if (status === 'Idle') return 'warn';
  return 'default';
}

function oeeTone(oee: number): 'good' | 'warn' | 'bad' | 'default' {
  if (oee >= 85) return 'good';
  if (oee >= 70) return 'warn';
  if (oee > 0) return 'bad';
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

  const overview = useQuery({
    queryKey: ['line-wise-overview', from, to],
    enabled: rangeValid,
    queryFn: async () =>
      (
        await api.get<ApiResponse<LineWisePayload>>('/dashboard/line-wise', {
          params: { from, to },
        })
      ).data.data,
  });

  const plants = useMemo(() => {
    const set = new Set((overview.data?.lines ?? []).map((l) => l.plantName));
    return [...set];
  }, [overview.data]);

  if (overview.isLoading) return <LoadingBlock />;
  if (!rangeValid) {
    return (
      <div>
        <PageHeader title="Line-wise Overview" subtitle="Per-line production & OEE analysis" />
        <div className="panel mb-4 flex flex-wrap items-end gap-3 p-4">
          <Field label="From Date">
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To Date">
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <div className="panel p-6 text-sm" style={{ color: 'var(--muted)' }}>
          From date must be on or before To date.
        </div>
      </div>
    );
  }
  if (overview.isError || !overview.data) {
    return (
      <div>
        <PageHeader title="Line-wise Overview" subtitle="Per-line production & OEE analysis" />
        <div className="panel mb-4 flex flex-wrap items-end gap-3 p-4">
          <Field label="From Date">
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To Date">
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
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
        subtitle="Compare every line — Planned vs Actual, Downtime, and OEE (A × P × Q)"
      />

      <div className="panel mb-4 flex flex-wrap items-end gap-3 p-4">
        <Field label="From Date">
          <input
            className="input"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="To Date">
          <input
            className="input"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => {
            const tdy = today();
            setFrom(tdy);
            setTo(tdy);
          }}
        >
          Today
        </button>
        <div className="pb-2 text-sm" style={{ color: 'var(--muted)' }}>
          Line-wise for <strong style={{ color: 'var(--text)' }}>{d.from}</strong>
          {' → '}
          <strong style={{ color: 'var(--text)' }}>{d.to}</strong>
          {' · '}
          {plants.length ? plants.join(' · ') : '—'}
          {' · '}
          {t.activeLines}/{t.lineCount} lines with plans
          {overview.isFetching ? ' · updating…' : ''}
        </div>
      </div>

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
        <KpiCard label="Plant OEE" value={`${t.oee}%`} tone={oeeTone(t.oee)} hint="A × P × Q" />
        <KpiCard label="Availability" value={`${t.availability}%`} />
        <KpiCard label="Performance" value={`${t.performance}%`} />
        <KpiCard label="Quality" value={`${t.quality}%`} />
        <KpiCard label="Planned Cases" value={t.plannedCases.toLocaleString()} />
        <KpiCard label="Actual Cases" value={t.actualCases.toLocaleString()} />
        <KpiCard
          label="Achievement"
          value={`${t.achievement}%`}
          tone={t.achievement >= 95 ? 'good' : t.achievement >= 85 ? 'warn' : 'bad'}
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
            <BarChart data={d.charts.oeeByLine}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="line" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="oee" name="OEE %" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="availability" name="A %" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="performance" name="P %" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="quality" name="Q %" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Line-wise Plan vs Actual">
          <ResponsiveContainer>
            <BarChart data={d.charts.planVsActual}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="line" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="planned" name="Planned" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual" name="Actual" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="mb-4">
        <ChartCard title="Line-wise Downtime (min)">
          <ResponsiveContainer>
            <BarChart data={d.charts.downtimeByLine}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="line" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="downtime" name="Downtime min" fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
            </BarChart>
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
                  <td>{l.achievement}%</td>
                  <td>{l.goodCases.toLocaleString()}</td>
                  <td>{l.rejectCases.toLocaleString()}</td>
                  <td>{Math.round(l.downtimeMins)}</td>
                  <td>{Math.round(l.runTimeMins)}</td>
                  <td>{l.availability}%</td>
                  <td>{l.performance}%</td>
                  <td>{l.quality}%</td>
                  <td className="font-semibold">{l.oee}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
