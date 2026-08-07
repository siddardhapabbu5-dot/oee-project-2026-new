import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Boxes,
  CheckCircle2,
  Clock3,
  FilterX,
  Gauge,
  Package,
  Percent,
  Target,
  Timer,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import api, { type ApiResponse } from '../lib/api';
import { ChartCard, Field, KpiCard, LoadingBlock, PageHeader } from '../components/ui';
import { useAuthStore } from '../store';
import {
  downtimeColor,
  downtimeTone,
  lossCategoryColor,
  metricColor,
  metricTone,
} from '../lib/metricBands';

type Kpis = {
  plannedCases: number;
  actualCases: number;
  achievement: number;
  productionLoss: number;
  goodCases: number;
  rejectCases: number;
  oee: number;
  availability: number;
  performance: number;
  quality: number;
  downtime: number;
  capacityUtilization: number;
  runTimeMins?: number;
  plannedProductionTimeMins?: number;
  scheduledProductionTimeMins?: number;
  plannedLossMins?: number;
  idealCycleTimeMins?: number;
};

type Charts = {
  planVsActual: Array<{ date: string; planned: number; actual: number }>;
  dailyTrend: Array<{ date: string; actual: number; good: number }>;
  shiftPerformance: Array<{ shift: string; planned: number; actual: number }>;
  linePerformance: Array<{ line: string; planned: number; actual: number }>;
  oeeTrend: Array<{ date: string; oee: number }>;
  downtimeByCategory: Array<{ name: string; minutes: number }>;
  productContribution: Array<{ name: string; actual: number }>;
  capacityUtilization: Array<{ date: string; utilization: number }>;
};

const PIE_FALLBACK = [
  'var(--cat-mechanical)',
  'var(--cat-electrical)',
  'var(--cat-utility)',
  'var(--cat-material)',
  'var(--cat-quality-hold)',
  'var(--cat-manpower)',
  'var(--cat-planned-loss)',
  'var(--pillar-availability)',
];

const PIE_TOP_N = 7;

function downtimeSliceColor(name: string, index: number) {
  const mapped = lossCategoryColor(name);
  if (mapped !== 'var(--muted)') return mapped;
  return PIE_FALLBACK[index % PIE_FALLBACK.length];
}

function consolidatePieRows(rows: Array<{ name: string; minutes: number }>, topN = PIE_TOP_N) {
  const merged = new Map<string, { name: string; minutes: number }>();
  for (const row of rows) {
    const label = (row.name || 'Other').trim() || 'Other';
    const key = label.toLowerCase();
    const prev = merged.get(key);
    if (prev) prev.minutes += Math.round(row.minutes);
    else merged.set(key, { name: label, minutes: Math.round(row.minutes) });
  }
  const sorted = [...merged.values()].filter((r) => r.minutes > 0).sort((a, b) => b.minutes - a.minutes);
  if (sorted.length <= topN) return sorted;
  const head = sorted.slice(0, topN - 1);
  const otherMins = sorted.slice(topN - 1).reduce((s, r) => s + r.minutes, 0);
  return [...head, { name: 'Other', minutes: otherMins }];
}

function today() {
  return localYmd(new Date());
}

function monthStart() {
  const d = new Date();
  return localYmd(new Date(d.getFullYear(), d.getMonth(), 1));
}

function localYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format YYYY-MM-DD → "31 Aug" for chart axes */
function fmtAxisDate(iso: string) {
  if (!iso || iso.length < 10) return iso;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/** Fill every calendar day in [from, to] so trend lines are continuous */
function fillDays<T extends { date: string }>(
  from: string,
  to: string,
  rows: T[],
  empty: (date: string) => T,
): T[] {
  const byDate = new Map(rows.map((r) => [r.date.slice(0, 10), r]));
  const out: T[] = [];
  const cur = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime())) return rows;
  while (cur <= end) {
    const key = localYmd(cur);
    out.push(byDate.get(key) ?? empty(key));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [from, setFrom] = useState(() => monthStart());
  const [to, setTo] = useState(() => today());
  const [shiftId, setShiftId] = useState('');
  const rangeValid = Boolean(from && to && from <= to);

  const clearFilters = () => {
    setFrom(monthStart());
    setTo(today());
    setShiftId('');
  };

  const shifts = useQuery({
    queryKey: ['shifts-dashboard'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/shifts')).data.data,
    staleTime: 300_000,
  });

  const summary = useQuery({
    queryKey: ['dashboard-summary', from, to, shiftId],
    enabled: rangeValid,
    queryFn: async () =>
      (
        await api.get<ApiResponse<{ kpis: Kpis; charts: Charts }>>('/dashboard/summary', {
          params: { from, to, ...(shiftId ? { shiftId } : {}) },
        })
      ).data.data,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const weekMonth = to.slice(0, 7);
  const weekWise = useQuery({
    queryKey: ['dashboard-week-wise', weekMonth],
    enabled: rangeValid && Boolean(weekMonth),
    queryFn: async () =>
      (
        await api.get<
          ApiResponse<{
            charts: { oeeByWeek: Array<{ week: string; oee: number; availability: number; performance: number; quality: number }> };
          }>
        >('/dashboard/week-wise', { params: { month: weekMonth } })
      ).data.data,
    staleTime: 120_000,
    placeholderData: keepPreviousData,
  });

  const chartData = useMemo(() => {
    const c = summary.data?.charts;
    if (!c) {
      return {
        planVsActual: [] as Charts['planVsActual'],
        dailyTrend: [] as Charts['dailyTrend'],
        oeeTrend: [] as Charts['oeeTrend'],
        capacityUtilization: [] as Charts['capacityUtilization'],
        shiftPerformance: [] as Charts['shiftPerformance'],
        linePerformance: [] as Charts['linePerformance'],
        downtimeByCategory: [] as Charts['downtimeByCategory'],
        productContribution: [] as Charts['productContribution'],
      };
    }
    return {
      planVsActual: (c.planVsActual ?? []).filter((r) => (r.planned || 0) > 0 || (r.actual || 0) > 0),
      dailyTrend: fillDays(from, to, c.dailyTrend, (date) => ({ date, actual: 0, good: 0 })),
      oeeTrend: fillDays(from, to, c.oeeTrend, (date) => ({ date, oee: 0 })),
      capacityUtilization: fillDays(from, to, c.capacityUtilization, (date) => ({
        date,
        utilization: 0,
      })),
      shiftPerformance: c.shiftPerformance,
      linePerformance: c.linePerformance,
      downtimeByCategory: consolidatePieRows(c.downtimeByCategory ?? []),
      productContribution: c.productContribution,
    };
  }, [summary.data?.charts, from, to]);

  if (!rangeValid) {
    return (
      <div>
        <PageHeader
          title={`${user?.role === 'LINE_SUPERVISOR' ? 'Line' : 'Plant'} Dashboard`}
          subtitle="OEE = Availability × Performance × Quality"
        />
        <div className="panel mb-4 flex flex-wrap items-end gap-3 p-4">
          <Field label="From Date">
            <input
              className="input"
              type="date"
              value={from}
              max={today()}
              onChange={(e) => {
                const v = e.target.value;
                setFrom(v);
                if (to && v > to) setTo(v);
              }}
            />
          </Field>
          <Field label="To Date">
            <input
              className="input"
              type="date"
              value={to}
              max={today()}
              onChange={(e) => {
                const v = e.target.value;
                setTo(v);
                if (from && v < from) setFrom(v);
              }}
            />
          </Field>
          <Field label="Shift">
            <select className="input" value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
              <option value="">All shifts</option>
              {(shifts.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={'\u00a0'}>
            <button
              className="btn btn-secondary inline-flex items-center gap-2"
              type="button"
              onClick={clearFilters}
              title="Reset to month start → today"
            >
              <FilterX size={16} strokeWidth={1.75} />
              Clear
            </button>
          </Field>
        </div>
        <div className="panel p-6 text-sm" style={{ color: 'var(--danger)' }}>
          From date must be on or before To date.
        </div>
      </div>
    );
  }

  if (summary.isLoading && !summary.data) return <LoadingBlock />;
  if (summary.isError) {
    return (
      <div>
        <PageHeader
          title={`${user?.role === 'LINE_SUPERVISOR' ? 'Line' : 'Plant'} Dashboard`}
          subtitle="OEE = Availability × Performance × Quality"
        />
        <div className="panel mb-4 flex flex-wrap items-end gap-3 p-4">
          <Field label="From Date">
            <input
              className="input"
              type="date"
              value={from}
              max={today()}
              onChange={(e) => {
                const v = e.target.value;
                setFrom(v);
                if (to && v > to) setTo(v);
              }}
            />
          </Field>
          <Field label="To Date">
            <input
              className="input"
              type="date"
              value={to}
              max={today()}
              onChange={(e) => {
                const v = e.target.value;
                setTo(v);
                if (from && v < from) setFrom(v);
              }}
            />
          </Field>
          <Field label="Shift">
            <select className="input min-w-[10rem]" value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
              <option value="">All shifts</option>
              {(shifts.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={'\u00a0'}>
            <button
              className="btn btn-secondary inline-flex items-center gap-2"
              type="button"
              onClick={() => void summary.refetch()}
            >
              Retry
            </button>
          </Field>
        </div>
        <div className="panel p-6 text-sm" style={{ color: 'var(--danger)' }}>
          Could not load dashboard. Check that the API and PostgreSQL are running, then click Retry.
        </div>
      </div>
    );
  }
  if (!summary.data) return <LoadingBlock />;
  const k = summary.data.kpis;
  const c = chartData;

  return (
    <div>
      <PageHeader
        title={`${user?.role === 'LINE_SUPERVISOR' ? 'Line' : 'Plant'} Dashboard`}
        subtitle="OEE = Availability × Performance × Quality"
      />

      <div className="panel mb-4 flex flex-wrap items-end gap-3 p-4">
        <Field label="From Date">
          <input
            className="input"
            type="date"
            value={from}
            max={today()}
            onChange={(e) => {
              const v = e.target.value;
              setFrom(v);
              if (to && v > to) setTo(v);
            }}
          />
        </Field>
        <Field label="To Date">
          <input
            className="input"
            type="date"
            value={to}
            max={today()}
            onChange={(e) => {
              const v = e.target.value;
              setTo(v);
              if (from && v < from) setFrom(v);
            }}
          />
        </Field>
        <Field label="Shift">
          <select className="input min-w-[10rem]" value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
            <option value="">All shifts</option>
            {(shifts.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={'\u00a0'}>
          <button
            className="btn btn-secondary inline-flex items-center gap-2"
            type="button"
            onClick={clearFilters}
            title="Reset to month start → today"
          >
            <FilterX size={16} strokeWidth={1.75} />
            Clear
          </button>
        </Field>
        {summary.isFetching ? (
          <div className="pb-2 text-xs" style={{ color: 'var(--muted)' }}>
            Updating…
          </div>
        ) : null}
      </div>

      <div className="mb-5 grid gap-4 xl:grid-cols-12">
        <div className="kpi-featured xl:col-span-4 p-6">
          <div className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
            Overall Equipment Effectiveness
          </div>
          <div className="mt-2 text-5xl font-semibold tracking-tight" style={{ color: metricColor('oee', k.oee) }}>
            {k.oee}%
          </div>
          <div className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
            A × P × Q
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {(
              [
                { label: 'Availability', value: k.availability, kind: 'availability' as const },
                { label: 'Performance', value: k.performance, kind: 'performance' as const },
                { label: 'Quality', value: k.quality, kind: 'quality' as const },
              ] as const
            ).map((item) => (
              <div
                key={item.label}
                className="rounded-lg px-3 py-2"
                style={{
                  background: `color-mix(in oklab, ${metricColor(item.kind, item.value)} 14%, transparent)`,
                  boxShadow: `inset 3px 0 0 ${
                    item.kind === 'availability'
                      ? 'var(--pillar-availability)'
                      : item.kind === 'performance'
                        ? 'var(--pillar-performance)'
                        : 'var(--pillar-quality)'
                  }`,
                }}
              >
                <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
                  {item.label}
                </div>
                <div className="mt-0.5 text-sm font-semibold" style={{ color: metricColor(item.kind, item.value) }}>
                  {item.value}%
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 text-xs" style={{ color: 'var(--muted)' }}>
            <div>
              Planned:{' '}
              <span className="font-semibold" style={{ color: 'var(--text)' }}>
                {k.plannedProductionTimeMins ?? '—'} min
              </span>
              {k.plannedLossMins && k.plannedLossMins > 0 ? (
                <span className="mt-0.5 block text-[10px]">
                  ({k.scheduledProductionTimeMins ?? '—'} − {k.plannedLossMins} PPL)
                </span>
              ) : null}
            </div>
            <div>
              Operating:{' '}
              <span className="font-semibold" style={{ color: 'var(--text)' }}>
                {Math.round(k.runTimeMins ?? 0)} min
              </span>
            </div>
            <div>
              Unplanned DT:{' '}
              <span className="font-semibold" style={{ color: downtimeColor(k.downtime) }}>
                {Math.round(k.downtime)} min
              </span>
            </div>
            <div>
              Ideal Cycle:{' '}
              <span className="font-semibold" style={{ color: 'var(--text)' }}>
                {k.idealCycleTimeMins != null ? `${Number(k.idealCycleTimeMins).toFixed(4)}` : '—'}
              </span>
            </div>
          </div>
        </div>

        <div className="xl:col-span-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard label="Planned Cases" value={k.plannedCases.toLocaleString()} icon={Boxes} />
          <KpiCard label="Actual Cases" value={k.actualCases.toLocaleString()} icon={Package} tone="info" />
          <KpiCard
            label="Achievement %"
            value={`${k.achievement}%`}
            tone={metricTone('achievement', k.achievement)}
            icon={Target}
          />
          <KpiCard label="Production Loss" value={k.productionLoss.toLocaleString()} tone="warn" icon={AlertTriangle} />
          <KpiCard label="Good Cases" value={k.goodCases.toLocaleString()} tone="good" icon={CheckCircle2} />
          <KpiCard label="Reject Cases" value={k.rejectCases.toLocaleString()} tone="bad" icon={XCircle} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiCard
          label="Availability"
          value={`${k.availability}%`}
          hint="Operating ÷ (Scheduled − PPL)"
          icon={Activity}
          tone={metricTone('availability', k.availability)}
        />
        <KpiCard
          label="Performance"
          value={`${k.performance}%`}
          hint="(Ideal Cycle × Count) ÷ Operating Time"
          icon={Gauge}
          tone={metricTone('performance', k.performance)}
        />
        <KpiCard
          label="Quality"
          value={`${k.quality}%`}
          hint="Good Count ÷ Total Count"
          icon={Percent}
          tone={metricTone('quality', k.quality)}
        />
        <KpiCard label="Capacity Util." value={`${k.capacityUtilization}%`} hint="Actual ÷ Planned Cases" icon={BarChart3} />
        <KpiCard
          label="Downtime (min)"
          value={Math.round(k.downtime).toLocaleString()}
          icon={Timer}
          tone={downtimeTone(k.downtime)}
          hint={
            k.downtime <= 5
              ? '0–5 min · Excellent'
              : k.downtime <= 15
                ? '6–15 min · Good'
                : k.downtime <= 30
                  ? '16–30 min · Average'
                  : '>30 min · Poor'
          }
        />
        <KpiCard label="Operating Time (min)" value={Math.round(k.runTimeMins ?? 0).toLocaleString()} icon={Clock3} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <ChartCard title="Production Plan vs Actual">
          <ResponsiveContainer>
            <BarChart data={c.planVsActual}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={fmtAxisDate} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip labelFormatter={(v) => fmtAxisDate(String(v))} />
              <Legend />
              <Bar dataKey="planned" name="Planned" fill="var(--chart-2)" radius={4} />
              <Bar dataKey="actual" name="Actual" fill="var(--chart-1)" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Daily Production Trend">
          <ResponsiveContainer>
            <LineChart data={c.dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={fmtAxisDate} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip labelFormatter={(v) => fmtAxisDate(String(v))} />
              <Legend />
              <Line type="monotone" dataKey="actual" name="Actual" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="good" name="Good" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Shift Performance">
          <ResponsiveContainer>
            <BarChart data={c.shiftPerformance}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="shift" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="planned" name="Planned" fill="var(--chart-5)" radius={4} />
              <Bar dataKey="actual" name="Actual" fill="var(--chart-1)" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Line Performance">
          <ResponsiveContainer>
            <BarChart data={c.linePerformance}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="line" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="planned" name="Planned" fill="var(--chart-3)" radius={4} />
              <Bar dataKey="actual" name="Actual" fill="var(--chart-1)" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="OEE Trend">
          <ResponsiveContainer>
            <LineChart data={c.oeeTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={fmtAxisDate} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
              <Tooltip labelFormatter={(v) => fmtAxisDate(String(v))} formatter={(v) => [`${v}%`, 'OEE']} />
              <Line type="monotone" dataKey="oee" name="OEE %" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title={`Weekly OEE Trend (${weekMonth})`}>
          <ResponsiveContainer>
            <BarChart data={weekWise.data?.charts.oeeByWeek ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="oee" name="OEE %" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="availability" name="A %" fill="var(--pillar-availability)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="performance" name="P %" fill="var(--pillar-performance)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="quality" name="Q %" fill="var(--pillar-quality)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Downtime by Category" bodyClassName="h-auto min-h-[18rem]">
          {c.downtimeByCategory.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
              No downtime logged in this range
            </div>
          ) : (
            <div className="flex h-full min-h-[16rem] flex-col gap-3 sm:flex-row sm:items-center">
              <div className="mx-auto h-52 w-full max-w-[220px] shrink-0 sm:mx-0">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={c.downtimeByCategory}
                      dataKey="minutes"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={78}
                      paddingAngle={2}
                      stroke="var(--panel)"
                      strokeWidth={2}
                    >
                      {c.downtimeByCategory.map((row, i) => (
                        <Cell key={row.name} fill={downtimeSliceColor(row.name, i)} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v, _n, item) => {
                        const total = c.downtimeByCategory.reduce((s, r) => s + r.minutes, 0) || 1;
                        const mins = Math.round(Number(v));
                        const pct = ((mins / total) * 100).toFixed(1);
                        return [`${mins} min (${pct}%)`, String(item?.payload?.name ?? 'Downtime')];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="max-h-52 flex-1 space-y-1.5 overflow-y-auto pr-1 text-sm">
                {(() => {
                  const total = c.downtimeByCategory.reduce((s, r) => s + r.minutes, 0) || 1;
                  return c.downtimeByCategory.map((row, i) => (
                    <li key={row.name} className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ background: downtimeSliceColor(row.name, i) }}
                      />
                      <span className="min-w-0 flex-1 truncate" title={row.name} style={{ color: 'var(--text)' }}>
                        {row.name}
                      </span>
                      <span className="shrink-0 tabular-nums" style={{ color: 'var(--muted)' }}>
                        {row.minutes}m
                      </span>
                      <span className="w-10 shrink-0 text-right tabular-nums" style={{ color: 'var(--muted)' }}>
                        {((row.minutes / total) * 100).toFixed(0)}%
                      </span>
                    </li>
                  ));
                })()}
              </ul>
            </div>
          )}
        </ChartCard>
        <ChartCard title="Product Contribution">
          <ResponsiveContainer>
            <BarChart data={c.productContribution} margin={{ bottom: 28 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10 }}
                interval={0}
                angle={c.productContribution.length > 2 ? -20 : 0}
                textAnchor={c.productContribution.length > 2 ? 'end' : 'middle'}
                height={50}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="actual" name="Actual Cases" fill="var(--chart-1)" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Capacity Utilisation">
          <ResponsiveContainer>
            <LineChart data={c.capacityUtilization}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={fmtAxisDate} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
              <Tooltip
                labelFormatter={(v) => fmtAxisDate(String(v))}
                formatter={(v) => [`${Number(v).toFixed(1)}%`, 'Utilisation']}
              />
              <Line
                type="monotone"
                dataKey="utilization"
                name="Utilisation %"
                stroke="var(--chart-2)"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
