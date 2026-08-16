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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import api, { type ApiResponse } from '../lib/api';
import { ChartValueLabels } from '../components/chartLabels';
import { FilterBar, FilterField, FILTER_CTRL } from '../components/FilterBar';
import { ChartCard, KpiCard, LoadingBlock, PageHeader } from '../components/ui';
import { metricTone } from '../lib/metricBands';

const PARETO_COLORS = ['#0d9488', '#0284c7', '#ca8a04', '#ea580c', '#dc2626', '#7c3aed', '#65a30d', '#db2777'];
const PIE_COLORS = PARETO_COLORS;

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
    rft: number | null;
    defectRate: number;
    entryCount: number;
    rftTarget: number;
    vsTarget: number | null;
  };
  trend: TrendRow[];
  trendWeekly: TrendRow[];
  trendMonthly: TrendRow[];
  byLine: MetricRow[];
  byShift: MetricRow[];
  byProduct: MetricRow[];
  bySku: MetricRow[];
  byArea: Array<{ code: string; name: string; quantity: number; pct: number; rejectPct: number }>;
  rejectPctByArea: Array<{ name: string; rejectPct: number; quantity: number }>;
  pareto: Array<{ name: string; quantity: number; pct: number; cumulativePct: number }>;
  byType: Array<{ name: string; area: string; quantity: number; pct: number }>;
  composition: Array<{ name: string; quantity: number; pct: number }>;
  kaizen: Array<{ name: string; produced: number; totalReject: number; firstTimeGood: number; rft: number }>;
  heatmapArea: Array<Record<string, string | number>>;
  heatmapShift: Array<Record<string, string | number>>;
  heatmapShiftNames: string[];
  rows: Array<{
    id: string;
    date: string;
    shift: string;
    line: string;
    product: string;
    sku: string;
    totalProduced: number;
    byArea: Record<string, number>;
    totalReject: number;
    firstTimeGood: number;
    rft: number | null;
  }>;
};

function localYmd(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthStart() {
  const d = new Date();
  return localYmd(new Date(d.getFullYear(), d.getMonth(), 1));
}

function fmtAxisDate(iso: string) {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function fmtDate(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-');
}

function heatColor(value: number, max: number) {
  if (max <= 0 || value <= 0) return 'color-mix(in srgb, var(--border) 35%, transparent)';
  const t = Math.min(1, value / max);
  if (t < 0.33) return 'color-mix(in srgb, #fbbf24 55%, white)';
  if (t < 0.66) return 'color-mix(in srgb, #f97316 70%, white)';
  return 'color-mix(in srgb, #dc2626 80%, white)';
}

function rftHeatColor(rft: number) {
  if (rft <= 0) return 'color-mix(in srgb, var(--border) 35%, transparent)';
  if (rft >= 98) return 'color-mix(in srgb, #16a34a 55%, white)';
  if (rft >= 95) return 'color-mix(in srgb, #fbbf24 55%, white)';
  return 'color-mix(in srgb, #dc2626 65%, white)';
}

export default function RftDashboardPage() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => localYmd());
  const [lineId, setLineId] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [trendGrain, setTrendGrain] = useState<'day' | 'week' | 'month'>('day');
  const [heatMode, setHeatMode] = useState<'area' | 'shift'>('area');
  const rangeValid = Boolean(from && to && from <= to);

  const lines = useQuery({
    queryKey: ['lines'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; code: string; name: string }>>>('/lines', { params: { limit: 100 } }))
        .data.data,
    staleTime: 300_000,
  });

  const shifts = useQuery({
    queryKey: ['shifts'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/shifts')).data.data,
    staleTime: 300_000,
  });

  const report = useQuery({
    queryKey: ['rft-dashboard', from, to, lineId, shiftId],
    enabled: rangeValid,
    queryFn: async () =>
      (
        await api.get<ApiResponse<RftPayload>>('/dashboard/rft', {
          params: {
            from,
            to,
            ...(lineId ? { lineId } : {}),
            ...(shiftId ? { shiftId } : {}),
          },
        })
      ).data.data,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const trendSeries = useMemo(() => {
    const d = report.data;
    if (!d) return [];
    const src =
      trendGrain === 'week' ? d.trendWeekly : trendGrain === 'month' ? d.trendMonthly : d.trend;
    return (src ?? []).map((r) => ({
      ...r,
      label: r.period || (r.date ? fmtAxisDate(r.date) : ''),
    }));
  }, [report.data, trendGrain]);

  const heatMax = useMemo(() => {
    const rows = report.data?.heatmapArea ?? [];
    let max = 0;
    for (const row of rows) {
      for (const [k, v] of Object.entries(row)) {
        if (k === 'date' || k === 'dateLabel' || k === 'total') continue;
        if (typeof v === 'number') max = Math.max(max, v);
      }
    }
    return max;
  }, [report.data?.heatmapArea]);

  const filters = (
    <FilterBar columnsClassName="sm:grid-cols-2 lg:grid-cols-6">
      <FilterField label="From">
        <input className={FILTER_CTRL} type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
      </FilterField>
      <FilterField label="To">
        <input
          className={FILTER_CTRL}
          type="date"
          value={to}
          min={from || undefined}
          max={localYmd()}
          onChange={(e) => setTo(e.target.value)}
        />
      </FilterField>
      <FilterField label="Line">
        <select className={FILTER_CTRL} value={lineId} onChange={(e) => setLineId(e.target.value)}>
          <option value="">All lines</option>
          {(lines.data ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.code || l.name}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField label="Shift">
        <select className={FILTER_CTRL} value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
          <option value="">All shifts</option>
          {(shifts.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField label="Trend grain">
        <select
          className={FILTER_CTRL}
          value={trendGrain}
          onChange={(e) => setTrendGrain(e.target.value as 'day' | 'week' | 'month')}
        >
          <option value="day">Daily</option>
          <option value="week">Weekly</option>
          <option value="month">Monthly</option>
        </select>
      </FilterField>
      <FilterField label="This month">
        <button
          type="button"
          className={`${FILTER_CTRL} cursor-pointer px-3 font-medium`}
          onClick={() => {
            setFrom(monthStart());
            setTo(localYmd());
          }}
        >
          This month
        </button>
      </FilterField>
    </FilterBar>
  );

  if (!rangeValid) {
    return (
      <div>
        <PageHeader title="RFT Dashboard" subtitle="Management charts for Right First Time" />
        {filters}
        <div className="panel p-6 text-sm" style={{ color: 'var(--danger)' }}>
          From date must be on or before To date.
        </div>
      </div>
    );
  }

  if (report.isError) {
    return (
      <div>
        <PageHeader title="RFT Dashboard" subtitle="Management charts for Right First Time" />
        {filters}
        <div className="panel p-6 text-sm" style={{ color: 'var(--danger)' }}>
          Failed to load RFT dashboard.
        </div>
      </div>
    );
  }

  if (report.isLoading || !report.data) {
    return (
      <div>
        <PageHeader title="RFT Dashboard" subtitle="Management charts for Right First Time" />
        {filters}
        <LoadingBlock />
      </div>
    );
  }

  const d = report.data;
  const k = d.kpis;
  const areas = d.areas ?? [];
  const target = d.rftTarget ?? 98;
  const rftTone = k.rft == null ? undefined : metricTone('quality', k.rft);

  return (
    <div>
      <PageHeader
        title="RFT Dashboard"
        subtitle="10 management charts — trend, Pareto, shift/SKU, Kaizen impact, heatmap"
      />
      {filters}

      <div
        className="panel mb-5 px-4 py-3 text-sm"
        style={{ background: 'color-mix(in srgb, var(--primary) 8%, transparent)' }}
      >
        <div className="font-semibold">{d.formula}</div>
        <div className="mt-1" style={{ color: 'var(--muted)' }}>
          Target RFT = {target}%. Pareto &amp; composition use area rejects from RFT Entries.
        </div>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard label="Total Produced" value={k.totalProduced.toLocaleString()} />
        <KpiCard label="Total Reject" value={k.totalReject.toLocaleString()} tone="bad" />
        <KpiCard label="First Time Good" value={k.firstTimeGood.toLocaleString()} tone="good" />
        <KpiCard label="RFT %" value={k.rft == null ? '—' : `${k.rft}%`} tone={rftTone} />
        <KpiCard label="Target" value={`${target}%`} hint="Management KPI" tone="info" />
        <KpiCard
          label="vs Target"
          value={k.vsTarget == null ? '—' : `${k.vsTarget > 0 ? '+' : ''}${k.vsTarget}%`}
          tone={k.vsTarget != null && k.vsTarget >= 0 ? 'good' : 'bad'}
        />
      </div>

      {d.rows.length === 0 ? (
        <div className="panel p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
          No RFT entries yet. Add area-wise rejects on <strong>RFT Entries</strong>.
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            {/* 1. RFT % Trend */}
            <ChartCard title="1. RFT % Trend">
              <ResponsiveContainer>
                <LineChart data={trendSeries} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="rft" name="RFT %" stroke="var(--chart-1)" strokeWidth={2}>
                    <ChartValueLabels />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* 5. RFT vs Target */}
            <ChartCard title="5. RFT vs Target">
              <ResponsiveContainer>
                <LineChart data={trendSeries} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis domain={[Math.min(90, target - 5), 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="rft" name="Actual RFT" stroke="var(--chart-1)" strokeWidth={2} />
                  <Line
                    type="monotone"
                    dataKey="target"
                    name={`Target ${target}%`}
                    stroke="#94a3b8"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* 2. Area-wise Reject Pareto */}
            <ChartCard title="2. Area-wise Reject — Pareto">
              <ResponsiveContainer>
                <ComposedChart data={d.pareto} margin={{ top: 18, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="quantity" name="Reject qty" radius={4}>
                    {d.pareto.map((_, i) => (
                      <Cell key={i} fill={PARETO_COLORS[i % PARETO_COLORS.length]} />
                    ))}
                    <ChartValueLabels />
                  </Bar>
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="cumulativePct"
                    name="Cumulative %"
                    stroke="#0f172a"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* 3. Reject % by Area */}
            <ChartCard title="3. Reject % by Area">
              <ResponsiveContainer>
                <BarChart data={d.rejectPctByArea ?? d.byArea} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                  <Tooltip />
                  <Bar dataKey="rejectPct" name="Reject % of produced" fill="var(--chart-3)" radius={4}>
                    <ChartValueLabels />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* 4. Defect Type */}
            <ChartCard title="4. Defect Type">
              <ResponsiveContainer>
                <BarChart data={d.byType} margin={{ top: 18, right: 8, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-25} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Bar dataKey="quantity" name="Defect qty" fill="var(--chart-4)" radius={4}>
                    <ChartValueLabels />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* 8. Reject Composition Pie */}
            <ChartCard title="8. Reject Composition">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={d.composition ?? []}
                    dataKey="quantity"
                    nameKey="name"
                    outerRadius={95}
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
            </ChartCard>

            {/* 6. Shift-wise RFT */}
            <ChartCard title="6. Shift-wise RFT">
              <ResponsiveContainer>
                <BarChart data={d.byShift} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                  <Tooltip />
                  <Bar dataKey="rft" name="RFT %" fill="var(--chart-5)" radius={4}>
                    <ChartValueLabels />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* 7. SKU-wise RFT */}
            <ChartCard title="7. SKU-wise RFT">
              <ResponsiveContainer>
                <BarChart data={d.bySku ?? []} margin={{ top: 18, right: 8, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-25} textAnchor="end" height={50} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                  <Tooltip />
                  <Bar dataKey="rft" name="RFT %" fill="var(--chart-2)" radius={4}>
                    <ChartValueLabels />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* 9. Before vs After Kaizen */}
            <ChartCard title="9. Before vs After Kaizen">
              <p className="mb-2 px-1 text-xs" style={{ color: 'var(--muted)' }}>
                Period split (first half vs second half of selected dates) — proves improvement direction until a dedicated Kaizen log is added.
              </p>
              <ResponsiveContainer>
                <BarChart data={d.kaizen ?? []} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="rft" name="RFT %" fill="var(--chart-1)" radius={4}>
                    <ChartValueLabels />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Extra: FTG vs Reject stack for context */}
            <ChartCard title="Produced quality mix (FTG vs Reject)">
              <ResponsiveContainer>
                <BarChart data={trendSeries} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="firstTimeGood" name="First Time Good" stackId="a" fill="var(--chart-2)" />
                  <Bar dataKey="totalReject" name="Total Reject" stackId="a" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* 10. Heatmap */}
          <div className="panel mt-5 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
              <div>
                <div className="font-semibold">10. RFT Heatmap</div>
                <div className="text-xs" style={{ color: 'var(--muted)' }}>
                  {heatMode === 'area' ? 'Day × Area (reject qty)' : 'Day × Shift (RFT %)'}
                </div>
              </div>
              <select
                className={FILTER_CTRL}
                style={{ width: 'auto', minWidth: '10rem' }}
                value={heatMode}
                onChange={(e) => setHeatMode(e.target.value as 'area' | 'shift')}
              >
                <option value="area">Day × Area</option>
                <option value="shift">Day × Shift</option>
              </select>
            </div>
            <div className="table-wrap">
              {heatMode === 'area' ? (
                <table className="data">
                  <thead>
                    <tr>
                      <th>Date</th>
                      {areas.map((a) => (
                        <th key={a.code}>{a.shortLabel}</th>
                      ))}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(d.heatmapArea ?? []).map((row) => (
                      <tr key={String(row.date)}>
                        <td>{fmtDate(String(row.date))}</td>
                        {areas.map((a) => {
                          const val = Number(row[a.shortLabel] ?? 0);
                          return (
                            <td
                              key={a.code}
                              className="tabular-nums text-center"
                              style={{ background: heatColor(val, heatMax) }}
                            >
                              {val || '—'}
                            </td>
                          );
                        })}
                        <td className="tabular-nums font-medium">{Number(row.total ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="data">
                  <thead>
                    <tr>
                      <th>Date</th>
                      {(d.heatmapShiftNames ?? []).map((s) => (
                        <th key={s}>{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(d.heatmapShift ?? []).map((row) => (
                      <tr key={String(row.date)}>
                        <td>{fmtDate(String(row.date))}</td>
                        {(d.heatmapShiftNames ?? []).map((s) => {
                          const val = Number(row[s] ?? 0);
                          return (
                            <td
                              key={s}
                              className="tabular-nums text-center font-medium"
                              style={{ background: rftHeatColor(val) }}
                            >
                              {val ? `${val}%` : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="table-wrap mt-5">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Shift</th>
                  <th>Line</th>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Total Produced</th>
                  {areas.map((a) => (
                    <th key={a.code}>{a.shortLabel} Reject</th>
                  ))}
                  <th>Total Reject</th>
                  <th>First Time Good</th>
                  <th>RFT %</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.date)}</td>
                    <td>{r.shift}</td>
                    <td>{r.line}</td>
                    <td>{r.product}</td>
                    <td>{r.sku}</td>
                    <td className="tabular-nums">{r.totalProduced.toLocaleString()}</td>
                    {areas.map((a) => (
                      <td key={a.code} className="tabular-nums">
                        {(r.byArea[a.code] ?? 0).toLocaleString()}
                      </td>
                    ))}
                    <td className="tabular-nums font-medium" style={{ color: 'var(--danger)' }}>
                      {r.totalReject.toLocaleString()}
                    </td>
                    <td className="tabular-nums font-medium" style={{ color: 'var(--success)' }}>
                      {r.firstTimeGood.toLocaleString()}
                    </td>
                    <td className="tabular-nums font-semibold">
                      {r.rft == null ? '—' : `${r.rft}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
