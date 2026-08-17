import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import api, { type ApiResponse } from '../lib/api';
import { ChartValueLabels } from '../components/chartLabels';
import { FILTER_CTRL } from '../components/FilterBar';
import { LoadingBlock } from '../components/ui';

const BLUE = '#2563eb';
const GREEN = '#16a34a';
const RED = '#dc2626';
const PURPLE = '#7c3aed';
const PARETO_COLORS = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#1d4ed8', '#1e40af'];
const PIE_COLORS = ['#2563eb', '#16a34a', '#ca8a04', '#ea580c', '#7c3aed', '#0d9488', '#db2777'];

type MetricRow = { name: string; produced: number; totalReject: number; firstTimeGood: number; rft: number };
type TrendRow = {
  date?: string;
  period?: string;
  produced: number;
  totalReject: number;
  firstTimeGood: number;
  rft: number;
  target: number;
};

type RftPayload = {
  formula: string;
  rftTarget: number;
  areas: Array<{ id: string; code: string; name: string; shortLabel: string }>;
  kpis: {
    totalProduced: number;
    totalReject: number;
    firstTimeGood: number;
    reworkQty?: number;
    rft: number | null;
    rftTarget: number;
    vsTarget: number | null;
    entryCount: number;
  };
  trend: TrendRow[];
  byShift: MetricRow[];
  bySku: MetricRow[];
  rejectPctByArea: Array<{ name: string; rejectPct: number; quantity: number }>;
  pareto: Array<{ name: string; quantity: number; pct: number; cumulativePct: number }>;
  byType: Array<{ name: string; area: string; quantity: number; pct: number }>;
  composition: Array<{ name: string; quantity: number; pct: number }>;
  kaizenCompare?: Array<{ metric: string; before: number; after: number }>;
};

function localYmd(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtAxisDate(iso: string) {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function ChartPanel({
  n,
  title,
  children,
  className = '',
}: {
  n: number;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-h-[280px] flex-col rounded-xl border bg-white p-3 shadow-sm ${className}`} style={{ borderColor: '#e2e8f0' }}>
      <div className="mb-2 text-sm font-bold tracking-tight" style={{ color: '#0f172a' }}>
        <span style={{ color: BLUE }}>{n}. </span>
        {title}
      </div>
      <div className="min-h-0 flex-1" style={{ height: 220 }}>
        {children}
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'good' | 'bad' | 'warn' | 'target';
}) {
  const color =
    tone === 'good'
      ? '#16a34a'
      : tone === 'bad'
        ? '#dc2626'
        : tone === 'warn'
          ? '#ea580c'
          : tone === 'target'
            ? '#0f766e'
            : '#0f172a';
  return (
    <div className="rounded-xl border bg-white px-3 py-3 shadow-sm" style={{ borderColor: '#e2e8f0' }}>
      <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#64748b' }}>
        {label}
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums" style={{ color }}>
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 text-[11px]" style={{ color: '#94a3b8' }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

export default function RftDashboardPage() {
  const [from, setFrom] = useState(() => localYmd());
  const [to, setTo] = useState(() => localYmd());
  const [shiftId, setShiftId] = useState('');
  const rangeValid = Boolean(from && to && from <= to);

  const shifts = useQuery({
    queryKey: ['shifts'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/shifts')).data.data,
    staleTime: 300_000,
  });

  const report = useQuery({
    queryKey: ['rft-dashboard', from, to, '', shiftId],
    enabled: rangeValid,
    queryFn: async () =>
      (
        await api.get<ApiResponse<RftPayload>>('/dashboard/rft', {
          params: {
            from,
            to,
            ...(shiftId ? { shiftId } : {}),
          },
        })
      ).data.data,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const trend = useMemo(() => {
    return (report.data?.trend ?? []).map((r) => ({
      ...r,
      label: r.date ? fmtAxisDate(r.date) : r.period || '',
    }));
  }, [report.data?.trend]);

  const target = report.data?.rftTarget ?? 99.5;

  if (!rangeValid) {
    return (
      <div className="p-4 text-sm" style={{ color: 'var(--danger)' }}>
        From date must be on or before To date.
      </div>
    );
  }

  if (report.isLoading || !report.data) {
    return (
      <div>
        <LoadingBlock />
      </div>
    );
  }

  if (report.isError) {
    return (
      <div className="panel p-6 text-sm" style={{ color: 'var(--danger)' }}>
        Failed to load RFT dashboard.
      </div>
    );
  }

  const d = report.data;
  const k = d.kpis;
  const gap = k.vsTarget;
  const empty = (d.trend?.length ?? 0) === 0 && k.entryCount === 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight sm:text-xl" style={{ color: '#0f172a' }}>
            RFT (RIGHT FIRST TIME) DASHBOARD
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#64748b' }}>
            Quality goal tracking · Area Pareto · Shift &amp; SKU performance
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold" style={{ color: '#64748b' }}>
            From
            <input
              className={`${FILTER_CTRL} mt-1 block min-w-[9.5rem]`}
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-xs font-semibold" style={{ color: '#64748b' }}>
            To
            <input
              className={`${FILTER_CTRL} mt-1 block min-w-[9.5rem]`}
              type="date"
              value={to}
              min={from || undefined}
              max={localYmd()}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label className="text-xs font-semibold" style={{ color: '#64748b' }}>
            Shift
            <select
              className={`${FILTER_CTRL} mt-1 block min-w-[8rem]`}
              value={shiftId}
              onChange={(e) => setShiftId(e.target.value)}
            >
              <option value="">All</option>
              {(shifts.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* KPI row — 7 cards */}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
        <KpiTile label="Total Production" value={k.totalProduced.toLocaleString()} sub="Cases" />
        <KpiTile label="First Time Good" value={k.firstTimeGood.toLocaleString()} sub="Cases" tone="good" />
        <KpiTile label="Total Reject" value={k.totalReject.toLocaleString()} sub="Cases" tone="bad" />
        <KpiTile label="Rework Qty" value={String(k.reworkQty ?? 0)} sub="Cases" tone="warn" />
        <KpiTile
          label="RFT % (Actual)"
          value={k.rft == null ? '—' : `${k.rft.toFixed(2)}%`}
          tone={k.rft != null && k.rft >= target ? 'good' : 'warn'}
        />
        <KpiTile label="Target RFT %" value={`${target.toFixed(2)}%`} tone="target" />
        <KpiTile
          label="RFT Gap"
          value={gap == null ? '—' : `${gap > 0 ? '+' : ''}${gap.toFixed(2)}%`}
          tone={gap != null && gap >= 0 ? 'good' : 'bad'}
          sub="Actual − Target"
        />
      </div>

      {empty ? (
        <div className="rounded-xl border bg-white p-10 text-center text-sm" style={{ borderColor: '#e2e8f0', color: '#64748b' }}>
          No RFT entries yet. Add area-wise rejects on <strong>RFT Entries</strong>.
        </div>
      ) : (
        <>
          {/* 3 × 3 chart grid */}
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {/* 1 */}
            <ChartPanel n={1} title="RFT % Trend">
              <ResponsiveContainer>
                <LineChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis domain={[90, 100]} tick={{ fontSize: 10, fill: '#64748b' }} unit="%" width={40} />
                  <Tooltip />
                  <ReferenceLine y={target} stroke={GREEN} strokeDasharray="6 4" label={{ value: 'Target', fill: GREEN, fontSize: 10 }} />
                  <Line type="monotone" dataKey="rft" name="RFT %" stroke={BLUE} strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartPanel>

            {/* 2 */}
            <ChartPanel n={2} title="Area-Wise Reject – Pareto Chart">
              <ResponsiveContainer>
                <ComposedChart data={d.pareto} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis yAxisId="l" tick={{ fontSize: 10, fill: '#64748b' }} width={36} />
                  <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} unit="%" width={36} />
                  <Tooltip />
                  <Bar yAxisId="l" dataKey="quantity" name="Reject qty" radius={[4, 4, 0, 0]}>
                    {d.pareto.map((_, i) => (
                      <Cell key={i} fill={PARETO_COLORS[i % PARETO_COLORS.length]} />
                    ))}
                    <ChartValueLabels />
                  </Bar>
                  <Line yAxisId="r" type="monotone" dataKey="cumulativePct" name="Cumulative %" stroke={RED} strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartPanel>

            {/* 3 */}
            <ChartPanel n={3} title="Reject % By Area">
              <ResponsiveContainer>
                <BarChart data={d.rejectPctByArea ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} unit="%" width={40} />
                  <Tooltip />
                  <Bar dataKey="rejectPct" name="Reject %" fill={BLUE} radius={[4, 4, 0, 0]}>
                    <ChartValueLabels />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            {/* 4 — horizontal */}
            <ChartPanel n={4} title="Defect Type Wise Reject">
              <ResponsiveContainer>
                <BarChart
                  layout="vertical"
                  data={[...(d.byType ?? [])].slice(0, 8)}
                  margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10, fill: '#64748b' }} />
                  <Tooltip />
                  <Bar dataKey="quantity" name="Reject qty" fill={BLUE} radius={[0, 4, 4, 0]}>
                    <ChartValueLabels />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            {/* 5 */}
            <ChartPanel n={5} title="RFT % – Actual vs Target">
              <ResponsiveContainer>
                <LineChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis domain={[90, 100]} tick={{ fontSize: 10, fill: '#64748b' }} unit="%" width={40} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="rft" name="Actual RFT %" stroke={BLUE} strokeWidth={2.5} />
                  <Line type="monotone" dataKey="target" name={`Target ${target}%`} stroke={GREEN} strokeWidth={2} strokeDasharray="6 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartPanel>

            {/* 6 */}
            <ChartPanel n={6} title="Shift-Wise RFT %">
              <ResponsiveContainer>
                <BarChart data={d.byShift} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis domain={[90, 100]} tick={{ fontSize: 10, fill: '#64748b' }} unit="%" width={40} />
                  <Tooltip />
                  <ReferenceLine y={target} stroke={RED} strokeDasharray="6 4" />
                  <Bar dataKey="rft" name="RFT %" fill={BLUE} radius={[4, 4, 0, 0]}>
                    <ChartValueLabels />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            {/* 7 */}
            <ChartPanel n={7} title="SKU-Wise RFT %">
              <ResponsiveContainer>
                <BarChart data={d.bySku ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} />
                  <YAxis domain={[90, 100]} tick={{ fontSize: 10, fill: '#64748b' }} unit="%" width={40} />
                  <Tooltip />
                  <ReferenceLine y={target} stroke={RED} strokeDasharray="6 4" />
                  <Bar dataKey="rft" name="RFT %" fill={PURPLE} radius={[4, 4, 0, 0]}>
                    <ChartValueLabels />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            {/* 8 */}
            <ChartPanel n={8} title="Reject Composition – Pie Chart">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={d.composition ?? []}
                    dataKey="quantity"
                    nameKey="name"
                    outerRadius={80}
                    label={({ name, pct }) => `${name} ${pct}%`}
                  >
                    {(d.composition ?? []).map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartPanel>

            {/* 9 */}
            <ChartPanel n={9} title="Before vs After Kaizen">
              <ResponsiveContainer>
                <BarChart data={d.kaizenCompare ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="metric" tick={{ fontSize: 9, fill: '#64748b' }} interval={0} angle={-15} textAnchor="end" height={40} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} width={36} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="before" name="Before" fill={BLUE} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="after" name="After" fill={GREEN} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>

          {/* Footer notes */}
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm"
            style={{ borderColor: '#e2e8f0', background: '#f8fafc', color: '#334155' }}
          >
            <div>
              <strong>Formula:</strong> RFT % = (First Time Good Quantity ÷ Total Produced Quantity) × 100
            </div>
            <div>
              <strong>Target RFT % = {target.toFixed(2)}%</strong> (As per Quality Goal)
            </div>
          </div>
        </>
      )}
    </div>
  );
}
