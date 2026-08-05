import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Boxes,
  CheckCircle2,
  Clock3,
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

const COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  '#0d9488',
  '#ea580c',
  '#7c3aed',
  '#db2777',
  '#65a30d',
  '#0284c7',
  '#ca8a04',
];

const PIE_TOP_N = 7;

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
      planVsActual: fillDays(from, to, c.planVsActual, (date) => ({ date, planned: 0, actual: 0 })),
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
        </div>
        <div className="panel p-6 text-sm" style={{ color: 'var(--danger)' }}>
          From date must be on or before To date.
        </div>
      </div>
    );
  }

  if (summary.isLoading || !summary.data) return <LoadingBlock />;
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
      </div>

      <div className="mb-5 grid gap-4 xl:grid-cols-12">
        <div className="kpi-featured xl:col-span-4 p-6">
          <div className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
            Overall Equipment Effectiveness
          </div>
          <div className="mt-2 text-5xl font-semibold tracking-tight" style={{ color: 'var(--accent)' }}>
            {k.oee}%
          </div>
          <div className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
            A × P × Q
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {[
              { label: 'Availability', value: `${k.availability}%` },
              { label: 'Performance', value: `${k.performance}%` },
              { label: 'Quality', value: `${k.quality}%` },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg px-3 py-2"
                style={{ background: 'var(--accent-soft)' }}
              >
                <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
                  {item.label}
                </div>
                <div className="mt-0.5 text-sm font-semibold" style={{ color: 'var(--accent)' }}>
                  {item.value}
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
            </div>
            <div>
              Run:{' '}
              <span className="font-semibold" style={{ color: 'var(--text)' }}>
                {Math.round(k.runTimeMins ?? 0)} min
              </span>
            </div>
            <div>
              Downtime:{' '}
              <span className="font-semibold" style={{ color: 'var(--text)' }}>
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
            tone={k.achievement >= 95 ? 'good' : k.achievement >= 85 ? 'warn' : 'bad'}
            icon={Target}
          />
          <KpiCard label="Production Loss" value={k.productionLoss.toLocaleString()} tone="warn" icon={AlertTriangle} />
          <KpiCard label="Good Cases" value={k.goodCases.toLocaleString()} tone="good" icon={CheckCircle2} />
          <KpiCard label="Reject Cases" value={k.rejectCases.toLocaleString()} tone="bad" icon={XCircle} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiCard label="Availability" value={`${k.availability}%`} hint="Run Time ÷ Planned Time" icon={Activity} tone="info" />
        <KpiCard label="Performance" value={`${k.performance}%`} hint="(Ideal Cycle × Count) ÷ Run Time" icon={Gauge} />
        <KpiCard label="Quality" value={`${k.quality}%`} hint="Good ÷ Total Count" icon={Percent} tone="good" />
        <KpiCard label="Capacity Util." value={`${k.capacityUtilization}%`} hint="Actual ÷ Planned Cases" icon={BarChart3} />
        <KpiCard label="Downtime (min)" value={Math.round(k.downtime).toLocaleString()} icon={Timer} tone="warn" />
        <KpiCard label="Run Time (min)" value={Math.round(k.runTimeMins ?? 0).toLocaleString()} icon={Clock3} />
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
                      {c.downtimeByCategory.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
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
                        style={{ background: COLORS[i % COLORS.length] }}
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
        <ChartCard title="Capacity Utilization">
          <ResponsiveContainer>
            <LineChart data={c.capacityUtilization}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={fmtAxisDate} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
              <Tooltip
                labelFormatter={(v) => fmtAxisDate(String(v))}
                formatter={(v) => [`${Number(v).toFixed(1)}%`, 'Utilization']}
              />
              <Line
                type="monotone"
                dataKey="utilization"
                name="Utilization %"
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
