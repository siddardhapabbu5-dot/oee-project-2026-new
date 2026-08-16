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

const PARETO_COLORS = ['#0d9488', '#0284c7', '#ca8a04', '#ea580c', '#dc2626', '#7c3aed'];

type RftPayload = {
  formula: string;
  areas: Array<{ id: string; code: string; name: string; shortLabel: string }>;
  kpis: {
    totalProduced: number;
    totalReject: number;
    firstTimeGood: number;
    rft: number | null;
    defectRate: number;
    entryCount: number;
  };
  trend: Array<{ date: string; produced: number; totalReject: number; firstTimeGood: number; rft: number }>;
  byLine: Array<{ name: string; produced: number; totalReject: number; firstTimeGood: number; rft: number }>;
  byShift: Array<{ name: string; produced: number; totalReject: number; firstTimeGood: number; rft: number }>;
  byProduct: Array<{ name: string; produced: number; totalReject: number; firstTimeGood: number; rft: number }>;
  byArea: Array<{ code: string; name: string; quantity: number; pct: number }>;
  pareto: Array<{ name: string; quantity: number; pct: number; cumulativePct: number }>;
  byType: Array<{ name: string; area: string; quantity: number; pct: number }>;
  rows: Array<{
    id: string;
    date: string;
    shift: string;
    line: string;
    product: string;
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
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function fmtDate(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-');
}

export default function RftDashboardPage() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => localYmd());
  const [lineId, setLineId] = useState('');
  const [shiftId, setShiftId] = useState('');
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

  const trend = useMemo(
    () => (report.data?.trend ?? []).map((r) => ({ ...r, dateLabel: fmtAxisDate(r.date) })),
    [report.data?.trend],
  );

  const filters = (
    <FilterBar columnsClassName="sm:grid-cols-2 lg:grid-cols-5">
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
        <PageHeader title="RFT Dashboard" subtitle="Right First Time — quality by area" />
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
        <PageHeader title="RFT Dashboard" subtitle="Right First Time — quality by area" />
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
        <PageHeader title="RFT Dashboard" subtitle="Right First Time — quality by area" />
        {filters}
        <LoadingBlock />
      </div>
    );
  }

  const d = report.data;
  const k = d.kpis;
  const areas = d.areas ?? [];
  const rftTone = k.rft == null ? undefined : metricTone('quality', k.rft);

  return (
    <div>
      <PageHeader
        title="RFT Dashboard"
        subtitle="Identify which machine/process is causing quality loss"
      />
      {filters}

      <div
        className="panel mb-5 px-4 py-3 text-sm"
        style={{ background: 'color-mix(in srgb, var(--primary) 8%, transparent)' }}
      >
        <div className="font-semibold">{d.formula}</div>
        <div className="mt-1" style={{ color: 'var(--muted)' }}>
          Total Reject = sum of area rejects. First Time Good = Total Produced − Total Reject.
        </div>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Total Produced" value={k.totalProduced.toLocaleString()} />
        <KpiCard label="Total Reject" value={k.totalReject.toLocaleString()} tone="bad" />
        <KpiCard label="First Time Good" value={k.firstTimeGood.toLocaleString()} tone="good" />
        <KpiCard label="RFT %" value={k.rft == null ? '—' : `${k.rft}%`} tone={rftTone} hint="FTG ÷ Produced" />
        <KpiCard label="Entries" value={String(k.entryCount)} hint="RFT entry rows" />
      </div>

      {d.rows.length === 0 ? (
        <div className="panel p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
          No RFT entries yet. Add area-wise rejects on the RFT Entries page.
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Reject Pareto by Area">
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

            <ChartCard title="RFT Trend">
              <ResponsiveContainer>
                <LineChart data={trend} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                  <Tooltip />
                  <Line type="monotone" dataKey="rft" name="RFT %" stroke="var(--chart-1)" strokeWidth={2}>
                    <ChartValueLabels />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Produced vs Reject vs FTG">
              <ResponsiveContainer>
                <BarChart data={trend} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="firstTimeGood" name="First Time Good" stackId="a" fill="var(--chart-2)" />
                  <Bar dataKey="totalReject" name="Total Reject" stackId="a" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Reject by Type (Pareto detail)">
              <ResponsiveContainer>
                <BarChart data={d.byType} margin={{ top: 18, right: 8, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Bar dataKey="quantity" name="Qty" fill="var(--chart-4)" radius={4}>
                    <ChartValueLabels />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="RFT by Line">
              <ResponsiveContainer>
                <BarChart data={d.byLine} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                  <Tooltip />
                  <Bar dataKey="rft" name="RFT %" fill="var(--chart-1)" radius={4}>
                    <ChartValueLabels />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="RFT by Shift">
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
          </div>

          <div className="table-wrap mt-5">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Shift</th>
                  <th>Line</th>
                  <th>Product</th>
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
                    <td
                      className="tabular-nums font-semibold"
                      style={{
                        color:
                          r.rft == null
                            ? 'var(--muted)'
                            : r.rft >= 98
                              ? 'var(--success)'
                              : r.rft >= 95
                                ? 'var(--warn, #ca8a04)'
                                : 'var(--danger)',
                      }}
                    >
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
