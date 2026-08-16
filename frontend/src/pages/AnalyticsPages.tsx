import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FileSpreadsheet } from 'lucide-react';
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
import { ChartValueLabels } from '../components/chartLabels';
import { FilterBar, FilterField, FILTER_CTRL } from '../components/FilterBar';
import { ChartCard, Field, KpiCard, LoadingBlock, PageHeader, Badge } from '../components/ui';
import { StatusBadge } from '../components/CrudPage';
import { useMemo, useState } from 'react';
import { formatWorkOrder } from '../lib/workOrder';
import { metricColor, metricTone } from '../lib/metricBands';

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

function localYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayLocal() {
  return localYmd(new Date());
}

/** First day of the current calendar month (YYYY-MM-DD) */
function monthStartLocal() {
  const d = new Date();
  return localYmd(new Date(d.getFullYear(), d.getMonth(), 1));
}

function fmtAxisDate(iso: string) {
  if (!iso || iso.length < 10) return iso;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

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

function yTicksEvery60(maxValue: number) {
  const max = Math.max(60, Math.ceil(Math.max(0, maxValue) / 60) * 60);
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += 60) ticks.push(v);
  return { max, ticks };
}

export function OeePage() {
  const [from, setFrom] = useState(() => monthStartLocal());
  const [to, setTo] = useState(() => todayLocal());
  const [shiftId, setShiftId] = useState('');
  const rangeValid = Boolean(from && to && from <= to);

  const shifts = useQuery({
    queryKey: ['shifts-oee'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/shifts')).data.data,
    staleTime: 300_000,
  });

  const summary = useQuery({
    queryKey: ['dashboard-summary', from, to, shiftId],
    enabled: rangeValid,
    queryFn: async () =>
      (
        await api.get<
          ApiResponse<{
            kpis: {
              oee: number;
              availability: number;
              performance: number;
              quality: number;
              runTimeMins?: number;
              plannedProductionTimeMins?: number;
              idealCycleTimeMins?: number;
              goodCases: number;
              actualCases: number;
              downtime: number;
            };
            charts: {
              oeeTrend: Array<{ date: string; oee: number; availability: number; performance: number; quality: number }>;
              downtimeByMachine: Array<{ name: string; minutes: number }>;
              capacityUtilization: Array<{ date: string; utilization: number }>;
            };
          }>
        >('/dashboard/summary', { params: { from, to, ...(shiftId ? { shiftId } : {}) } })
      ).data.data,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const charts = useMemo(() => {
    const c = summary.data?.charts;
    if (!c) {
      return {
        oeeTrend: [] as Array<{ date: string; oee: number; availability: number; performance: number; quality: number }>,
        capacityUtilization: [] as Array<{ date: string; utilization: number }>,
        downtimeByMachine: [] as Array<{ name: string; minutes: number }>,
      };
    }
    return {
      oeeTrend: fillDays(from, to, c.oeeTrend, (date) => ({
        date,
        oee: 0,
        availability: 0,
        performance: 0,
        quality: 0,
      })),
      capacityUtilization: fillDays(from, to, c.capacityUtilization, (date) => ({ date, utilization: 0 })),
      downtimeByMachine: (c.downtimeByMachine ?? []).map((row) => ({
        ...row,
        minutes: Math.round(row.minutes),
      })),
    };
  }, [summary.data?.charts, from, to]);

  const dtScale = useMemo(() => {
    const max = charts.downtimeByMachine.reduce((m, r) => Math.max(m, r.minutes), 0);
    return yTicksEvery60(max);
  }, [charts.downtimeByMachine]);

  if (!rangeValid) {
    return (
      <div>
        <PageHeader title="OEE Dashboard" subtitle="OEE = Availability × Performance × Quality" />
        <FilterBar>
          <FilterField label="From Date">
            <input
              className={FILTER_CTRL}
              type="date"
              value={from}
              max={todayLocal()}
              onChange={(e) => {
                const v = e.target.value;
                setFrom(v);
                if (to && v > to) setTo(v);
              }}
            />
          </FilterField>
          <FilterField label="To Date">
            <input
              className={FILTER_CTRL}
              type="date"
              value={to}
              max={todayLocal()}
              onChange={(e) => {
                const v = e.target.value;
                setTo(v);
                if (from && v < from) setFrom(v);
              }}
            />
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
        </FilterBar>
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
        <PageHeader title="OEE Dashboard" subtitle="OEE = Availability × Performance × Quality" />
        <FilterBar>
          <FilterField label="From Date">
            <input className={FILTER_CTRL} type="date" value={from} max={todayLocal()} onChange={(e) => setFrom(e.target.value)} />
          </FilterField>
          <FilterField label="To Date">
            <input className={FILTER_CTRL} type="date" value={to} max={todayLocal()} onChange={(e) => setTo(e.target.value)} />
          </FilterField>
          <FilterField label="Retry">
            <button
              className={`${FILTER_CTRL} cursor-pointer px-3 font-medium`}
              type="button"
              onClick={() => void summary.refetch()}
            >
              Retry
            </button>
          </FilterField>
        </FilterBar>
        <div className="panel p-6 text-sm" style={{ color: 'var(--danger)' }}>
          Could not load OEE dashboard. Check that the API and PostgreSQL (Docker) are running, then click Retry.
        </div>
      </div>
    );
  }
  if (!summary.data) return <LoadingBlock />;
  const k = summary.data.kpis;
  const c = charts;

  return (
    <div>
      <PageHeader
        title="OEE Dashboard"
        subtitle="OEE = Availability × Performance × Quality"
      />

      <FilterBar>
        <FilterField label="From Date">
          <input
            className={FILTER_CTRL}
            type="date"
            value={from}
            max={todayLocal()}
            onChange={(e) => {
              const v = e.target.value;
              setFrom(v);
              if (to && v > to) setTo(v);
            }}
          />
        </FilterField>
        <FilterField label="To Date">
          <input
            className={FILTER_CTRL}
            type="date"
            value={to}
            max={todayLocal()}
            onChange={(e) => {
              const v = e.target.value;
              setTo(v);
              if (from && v < from) setFrom(v);
            }}
          />
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
      </FilterBar>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="OEE" value={`${k.oee}%`} tone={metricTone('oee', k.oee)} />
        <KpiCard
          label="Availability"
          value={`${k.availability}%`}
          hint="Run Time ÷ Planned Time"
          tone={metricTone('availability', k.availability)}
        />
        <KpiCard
          label="Performance"
          value={`${k.performance}%`}
          hint="(Ideal Cycle × Count) ÷ Run Time"
          tone={metricTone('performance', k.performance)}
        />
        <KpiCard
          label="Quality"
          value={`${k.quality}%`}
          hint="Good Count ÷ Total Count"
          tone={metricTone('quality', k.quality)}
        />
      </div>

      <div className="panel mb-4 p-4 text-sm" style={{ color: 'var(--muted)' }}>
        <div className="font-semibold" style={{ color: 'var(--text)' }}>
          Formula
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Availability = Run Time ÷ Planned Production Time × 100%</li>
          <li>Performance = (Ideal Cycle Time × Total Count) ÷ Run Time × 100%</li>
          <li>Quality = Good Count ÷ Total Count × 100%</li>
          <li>OEE = Availability × Performance × Quality</li>
        </ul>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            Planned Time:{' '}
            <strong style={{ color: 'var(--text)' }}>
              {((k.plannedProductionTimeMins ?? 0) / 60).toFixed(1)} h
            </strong>
          </div>
          <div>
            Run Time:{' '}
            <strong style={{ color: 'var(--text)' }}>{((k.runTimeMins ?? 0) / 60).toFixed(1)} h</strong>
          </div>
          <div>
            Downtime: <strong style={{ color: 'var(--text)' }}>{(k.downtime / 60).toFixed(1)} h</strong>
          </div>
          <div>
            Ideal Cycle:{' '}
            <strong style={{ color: 'var(--text)' }}>
              {k.idealCycleTimeMins != null ? `${Number(k.idealCycleTimeMins).toFixed(4)} min/case` : '—'}
            </strong>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="OEE Components Trend">
          <ResponsiveContainer>
            <LineChart data={c.oeeTrend} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={fmtAxisDate} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip labelFormatter={(v) => fmtAxisDate(String(v))} />
              <Legend />
              <Line type="monotone" dataKey="oee" name="OEE" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }}>
                <ChartValueLabels suffix="%" />
              </Line>
              <Line type="monotone" dataKey="availability" name="Availability" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3 }}>
                <ChartValueLabels suffix="%" />
              </Line>
              <Line type="monotone" dataKey="performance" name="Performance" stroke="var(--chart-3)" strokeWidth={2} dot={{ r: 3 }}>
                <ChartValueLabels suffix="%" />
              </Line>
              <Line type="monotone" dataKey="quality" name="Quality" stroke="var(--chart-5)" strokeWidth={2} dot={{ r: 3 }}>
                <ChartValueLabels suffix="%" />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Downtime by Machine" bodyClassName="h-72">
          <ResponsiveContainer>
            <BarChart data={c.downtimeByMachine} margin={{ top: 18, right: 8, left: 4, bottom: 36 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: '#64748b' }}
                interval={0}
                angle={-18}
                textAnchor="end"
                height={56}
              />
              <YAxis
                domain={[0, dtScale.max]}
                ticks={dtScale.ticks}
                tick={{ fontSize: 11, fill: '#64748b' }}
                label={{ value: 'Minutes', angle: -90, position: 'insideLeft', style: { fill: 'var(--muted)', fontSize: 11 } }}
              />
              <Tooltip formatter={(v) => [`${Math.round(Number(v))} min`, 'Downtime']} />
              <Bar dataKey="minutes" name="Minutes" fill="var(--chart-4)" radius={4}>
                <ChartValueLabels />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Capacity Utilisation" className="xl:col-span-2">
          <ResponsiveContainer>
            <LineChart data={c.capacityUtilization} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={fmtAxisDate} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip
                labelFormatter={(v) => fmtAxisDate(String(v))}
                formatter={(v) => [`${Number(v).toFixed(1)}%`, 'Utilisation']}
              />
              <Line
                type="monotone"
                dataKey="utilization"
                name="Utilisation %"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              >
                <ChartValueLabels suffix="%" />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

export function PlanVsActualPage() {
  const today = () => todayLocal();
  const [from, setFrom] = useState(() => monthStartLocal());
  const [to, setTo] = useState(() => today());
  const [brandId, setBrandId] = useState('');
  const [skuId, setSkuId] = useState('');
  const [packVolume, setPackVolume] = useState('');

  const brands = useQuery({
    queryKey: ['brands-pva'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/brands', { params: { limit: 200 } })).data
        .data,
  });
  const skus = useQuery({
    queryKey: ['skus-pva'],
    queryFn: async () =>
      (
        await api.get<
          ApiResponse<Array<{ id: string; code: string; name: string; packVolume?: string | null; productId: string }>>
        >('/skus', { params: { limit: 500 } })
      ).data.data,
  });

  const PACK_VOLUME_ORDER = ['200 ML', '250 ML', '300 ML', '500 ML', '750 ML', '1000 ML', '2000 ML', 'Jar-20L'];

  const skuPackOptions = useMemo(() => {
    const found = new Set<string>();
    for (const s of skus.data ?? []) {
      const label = (s.packVolume || '').trim();
      if (label) found.add(label);
    }
    const ordered = PACK_VOLUME_ORDER.filter((p) => found.has(p) || found.has(p.toUpperCase()));
    const extras = [...found].filter((p) => !PACK_VOLUME_ORDER.some((o) => o.toLowerCase() === p.toLowerCase()));
    return [...ordered, ...extras.sort()];
  }, [skus.data]);

  type PvaPayload = {
    from: string;
    to: string;
    totals: {
      plannedCases: number;
      actualCases: number;
      variance: number;
      achievement: number;
      productCount: number;
    };
    chart: Array<{ product: string; planned: number; actual: number; variance: number }>;
    rows: Array<{
      date: string;
      productId: string;
      product: string;
      brand: string;
      plannedCases: number;
      actualCases: number;
      variance: number;
      achievement: number;
    }>;
    skuRows: Array<{
      date: string;
      productId: string;
      product: string;
      brand: string;
      skuId: string | null;
      sku: string;
      plannedCases: number;
      actualCases: number;
      variance: number;
      achievement: number;
    }>;
  };

  const report = useQuery({
    queryKey: ['plan-vs-actual', from, to, brandId, skuId, packVolume],
    enabled: Boolean(from && to && from <= to),
    queryFn: async () =>
      (
        await api.get<ApiResponse<PvaPayload>>('/dashboard/plan-vs-actual', {
          params: {
            from,
            to,
            ...(brandId ? { brandId } : {}),
            ...(skuId ? { skuId } : {}),
            ...(packVolume ? { packVolume } : {}),
          },
        })
      ).data.data,
  });

  if (report.isLoading || brands.isLoading || skus.isLoading) return <LoadingBlock />;
  if (report.isError || !report.data) {
    return (
      <div>
        <PageHeader title="Production Plan vs Actual" subtitle="Brand- and SKU-wise attainment" />
        <div className="panel p-6 text-sm" style={{ color: 'var(--muted)' }}>
          Failed to load Plan vs Actual. Check that the API is running.
        </div>
      </div>
    );
  }

  const d = report.data;
  const t = d.totals;
  const tableRows = d.skuRows?.length ? d.skuRows : d.rows.map((r) => ({ ...r, skuId: null as string | null, sku: '—' }));

  async function downloadExcel() {
    try {
      const res = await api.get('/dashboard/plan-vs-actual/export/excel', {
        responseType: 'blob',
        params: {
          from,
          to,
          ...(brandId ? { brandId } : {}),
          ...(skuId ? { skuId } : {}),
          ...(packVolume ? { packVolume } : {}),
        },
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plan-vs-actual-${from}_${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel downloaded');
    } catch {
      toast.error('Excel download failed');
    }
  }

  return (
    <div>
      <PageHeader
        title="Production Plan vs Actual"
        subtitle="Clustered column chart — brand- and SKU-wise · Variance = Actual − Planned"
        actions={
          <button className="btn btn-secondary" type="button" onClick={() => void downloadExcel()}>
            <FileSpreadsheet size={16} strokeWidth={1.75} />
            Download Excel
          </button>
        }
      />

      <FilterBar columnsClassName="sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_1fr_auto_minmax(0,1.2fr)]">
        <FilterField label="From Date">
          <input
            className={FILTER_CTRL}
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </FilterField>
        <FilterField label="To Date">
          <input
            className={FILTER_CTRL}
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </FilterField>
        <FilterField label="Brand">
          <select
            className={FILTER_CTRL}
            value={brandId}
            onChange={(e) => {
              setBrandId(e.target.value);
              setSkuId('');
            }}
          >
            <option value="">All Brands</option>
            {(brands.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="SKU">
          <select
            className={FILTER_CTRL}
            value={packVolume}
            onChange={(e) => {
              setPackVolume(e.target.value);
              setSkuId('');
            }}
          >
            <option value="">All SKUs</option>
            {skuPackOptions.map((pack) => (
              <option key={pack} value={pack}>
                {pack}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Reset">
          <button
            type="button"
            className={`${FILTER_CTRL} cursor-pointer px-3 font-medium`}
            onClick={() => {
              setFrom(monthStartLocal());
              setTo(today());
              setBrandId('');
              setSkuId('');
              setPackVolume('');
            }}
          >
            Reset
          </button>
        </FilterField>
        <div className="col-span-2 flex flex-col sm:col-span-1">
          <span className="mb-1.5 block text-sm font-medium opacity-0 select-none" aria-hidden>
            ·
          </span>
          <div className="flex min-h-10 items-center text-sm tabular-nums" style={{ color: 'var(--muted)' }}>
            {d.from} → {d.to}
            {report.isFetching ? ' · updating…' : ''}
          </div>
        </div>
      </FilterBar>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Planned Cases" value={t.plannedCases.toLocaleString()} />
        <KpiCard label="Actual Cases" value={t.actualCases.toLocaleString()} />
        <KpiCard
          label="Variance"
          value={t.variance.toLocaleString()}
          tone={t.variance >= 0 ? 'good' : 'bad'}
          hint="Actual − Planned"
        />
        <KpiCard
          label="Achievement %"
          value={`${t.achievement}%`}
          tone={metricTone('achievement', t.achievement)}
        />
      </div>

      <div className="mb-4">
        <ChartCard title="Plan vs Actual — Clustered Column (Product-wise)">
          <ResponsiveContainer>
            <BarChart data={d.chart} margin={{ top: 18, right: 8, left: 0, bottom: 48 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="product" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} angle={-25} textAnchor="end" height={70} />
              <YAxis tick={{ fill: '#64748b' }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="planned" name="Planned Cases" fill="var(--chart-2)" radius={[4, 4, 0, 0]}>
                <ChartValueLabels />
              </Bar>
              <Bar dataKey="actual" name="Actual Cases" fill="var(--chart-1)" radius={[4, 4, 0, 0]}>
                <ChartValueLabels />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="mb-2 text-sm font-semibold">
        Date · Product · SKU · Planned Cases · Actual Cases · Variance ({tableRows.length})
      </div>
      <div className="table-wrap panel">
        <table className="data">
          <thead>
            <tr>
              <th>Date</th>
              <th>Product</th>
              <th>SKU</th>
              <th>Brand</th>
              <th>Planned Cases</th>
              <th>Actual Cases</th>
              <th>Variance</th>
              <th>Achievement %</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center" style={{ color: 'var(--muted)' }}>
                  No plan/actual data for the selected filters
                </td>
              </tr>
            ) : (
              tableRows.map((r, idx) => (
                <tr key={`${r.date}-${r.productId}-${r.skuId ?? 'none'}-${idx}`}>
                  <td className="whitespace-nowrap">
                    {(() => {
                      const raw = String(r.date).slice(0, 10);
                      const d = new Date(`${raw}T12:00:00`);
                      return Number.isNaN(d.getTime())
                        ? raw
                        : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                    })()}
                  </td>
                  <td className="font-medium">{r.product}</td>
                  <td>{r.sku || '—'}</td>
                  <td>{r.brand}</td>
                  <td>{r.plannedCases.toLocaleString()}</td>
                  <td>{r.actualCases.toLocaleString()}</td>
                  <td style={{ color: r.variance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {r.variance.toLocaleString()}
                  </td>
                  <td style={{ color: metricColor('achievement', r.achievement) }}>{r.achievement}%</td>
                </tr>
              ))
            )}
          </tbody>
          {tableRows.length > 0 ? (
            <tfoot>
              <tr>
                <td colSpan={4} className="font-semibold">
                  Total
                </td>
                <td className="font-semibold">{t.plannedCases.toLocaleString()}</td>
                <td className="font-semibold">{t.actualCases.toLocaleString()}</td>
                <td
                  className="font-semibold"
                  style={{ color: t.variance >= 0 ? 'var(--success)' : 'var(--danger)' }}
                >
                  {t.variance.toLocaleString()}
                </td>
                <td className="font-semibold" style={{ color: metricColor('achievement', t.achievement) }}>
                  {t.achievement}%
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}

export function DowntimeAnalysisPage() {
  const today = () => todayLocal();
  const [from, setFrom] = useState(() => monthStartLocal());
  const [to, setTo] = useState(() => today());
  const [lineId, setLineId] = useState('');

  const lines = useQuery({
    queryKey: ['lines'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string; code?: string }>>>('/lines', { params: { limit: 100 } }))
        .data.data,
    staleTime: 300_000,
  });

  const data = useQuery({
    queryKey: ['downtime-analysis', from, to, lineId],
    queryFn: async () =>
      (
        await api.get<
          ApiResponse<{
            kpis: {
              totalEvents: number;
              totalMins: number;
              avgMins: number;
              categoryCount: number;
              machineCount: number;
              topCategory: string;
              topCategoryMins: number;
              topMachine: string;
              topMachineMins: number;
            };
            trend: Array<{ date: string; count: number; minutes: number }>;
            byCategory: Array<{ name: string; count: number; minutes: number }>;
            byMachine: Array<{ name: string; count: number; minutes: number }>;
            byLine: Array<{ name: string; count: number; minutes: number }>;
            byReason: Array<{ name: string; count: number; minutes: number }>;
            rows: Array<{
              id: string;
              date: string;
              planNumber: string;
              line: string;
              shift: string;
              machine: string;
              category: string;
              reason: string;
              durationMins: number;
              actionTaken: string;
              remarks: string;
            }>;
          }>
        >('/dashboard/downtime-analysis', {
          params: {
            from: from || undefined,
            to: to || undefined,
            lineId: lineId || undefined,
          },
        })
      ).data.data,
  });

  if (data.isLoading) return <LoadingBlock />;
  const d = data.data!;
  const k = d.kpis;

  return (
    <div>
      <PageHeader
        title="Downtime Analysis"
        subtitle="By category, machine, line & reason — with period filters"
      />

      <FilterBar>
        <FilterField label="From">
          <input className={FILTER_CTRL} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FilterField>
        <FilterField label="To">
          <input className={FILTER_CTRL} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
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
        <FilterField label="This month">
          <button
            type="button"
            className={`${FILTER_CTRL} cursor-pointer px-3 font-medium`}
            onClick={() => {
              setFrom(monthStartLocal());
              setTo(today());
            }}
          >
            This month
          </button>
        </FilterField>
      </FilterBar>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Downtime Events" value={k.totalEvents.toLocaleString()} />
        <KpiCard label="Total Minutes" value={k.totalMins.toLocaleString()} tone="bad" />
        <KpiCard label="Avg Mins / Event" value={k.avgMins.toLocaleString()} tone="warn" />
        <KpiCard label="Categories" value={k.categoryCount.toLocaleString()} tone="info" />
        <KpiCard label="Machines Affected" value={k.machineCount.toLocaleString()} />
        <KpiCard label="Top Category" value={k.topCategory} hint={`${k.topCategoryMins} min`} tone="warn" />
        <KpiCard label="Top Machine" value={k.topMachine} hint={`${k.topMachineMins} min`} tone="bad" />
        <KpiCard
          label="Hours Lost"
          value={(k.totalMins / 60).toFixed(1)}
          hint="Total downtime hours"
        />
      </div>

      {d.rows.length === 0 ? (
        <div className="panel p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
          No downtime entries in this date range. Log downtime from Production Entries first.
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Downtime Trend">
              <ResponsiveContainer>
                <LineChart data={d.trend} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="minutes" name="Minutes" stroke="var(--chart-4)" strokeWidth={2}>
                    <ChartValueLabels />
                  </Line>
                  <Line yAxisId="right" type="monotone" dataKey="count" name="Events" stroke="var(--chart-1)" strokeWidth={2}>
                    <ChartValueLabels />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="By Category" bodyClassName="h-auto min-h-[18rem]">
              {d.byCategory.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
                  No category data
                </div>
              ) : (
                <div className="flex min-h-[16rem] flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="mx-auto h-52 w-full max-w-[220px] shrink-0 sm:mx-0">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={d.byCategory}
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
                          {d.byCategory.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v, _n, item) => {
                            const total = d.byCategory.reduce((s, r) => s + r.minutes, 0) || 1;
                            const mins = Math.round(Number(v));
                            const pct = ((mins / total) * 100).toFixed(1);
                            return [`${mins} min (${pct}%)`, String(item?.payload?.name ?? 'Category')];
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="max-h-52 flex-1 space-y-1.5 overflow-y-auto pr-1 text-sm">
                    {(() => {
                      const total = d.byCategory.reduce((s, r) => s + r.minutes, 0) || 1;
                      return d.byCategory.map((row, i) => (
                        <li key={`${row.name}-${i}`} className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-sm"
                            style={{ background: COLORS[i % COLORS.length] }}
                          />
                          <span className="min-w-0 flex-1 truncate" title={row.name}>
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

            <ChartCard title="By Machine">
              <ResponsiveContainer>
                <BarChart data={d.byMachine} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Bar dataKey="minutes" name="Minutes" fill="var(--chart-4)" radius={4}>
                    <ChartValueLabels />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="By Line">
              <ResponsiveContainer>
                <BarChart data={d.byLine} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="minutes" name="Minutes" fill="var(--chart-3)" radius={4}>
                    <ChartValueLabels />
                  </Bar>
                  <Bar dataKey="count" name="Events" fill="var(--chart-1)" radius={4}>
                    <ChartValueLabels />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top Reasons" className="xl:col-span-2">
              <ResponsiveContainer>
                <BarChart data={d.byReason} layout="vertical" margin={{ top: 18, right: 28, left: 24, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Bar dataKey="minutes" name="Minutes" fill="var(--chart-5)" radius={4}>
                    <ChartValueLabels position="right" />
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
                  <th>Work Order</th>
                  <th>Line</th>
                  <th>Shift</th>
                  <th>Machine</th>
                  <th>Category</th>
                  <th>Reason</th>
                  <th>Mins</th>
                  <th>Action Plan</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td className="font-mono">{formatWorkOrder(r.planNumber)}</td>
                    <td>{r.line}</td>
                    <td>{r.shift}</td>
                    <td>{r.machine}</td>
                    <td>{r.category}</td>
                    <td>{r.reason}</td>
                    <td className="font-semibold" style={{ color: 'var(--danger)' }}>
                      {r.durationMins}
                    </td>
                    <td>{r.actionTaken}</td>
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

type ChangeoverAnalysis = {
  kpis: {
    totalChangeovers: number;
    totalActualMins: number;
    totalStandardMins: number;
    avgMins: number;
    varianceMins: number;
    overStandardCount: number;
    plannedCount: number;
    unplannedCount: number;
  };
  trend: Array<{ date: string; count: number; actualMins: number; standardMins: number }>;
  byType: Array<{ name: string; count: number; actualMins: number; standardMins: number }>;
  byLine: Array<{ name: string; count: number; actualMins: number }>;
  byKind: Array<{ name: string; count: number; actualMins: number }>;
  rows: Array<{
    id: string;
    date: string;
    line: string;
    fromProduct: string;
    fromSku: string;
    toProduct: string;
    toSku: string;
    type: string;
    kind: string;
    standardMins: number;
    actualMins: number;
    varianceMins: number;
    reason: string;
  }>;
};

export function ChangeoverAnalysisPage() {
  const today = () => todayLocal();
  const [from, setFrom] = useState(() => monthStartLocal());
  const [to, setTo] = useState(() => today());
  const [lineId, setLineId] = useState('');

  const lines = useQuery({
    queryKey: ['lines'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string; code?: string }>>>('/lines', { params: { limit: 100 } }))
        .data.data,
    staleTime: 300_000,
  });

  const data = useQuery({
    queryKey: ['changeover-analysis', from, to, lineId],
    queryFn: async () =>
      (
        await api.get<ApiResponse<ChangeoverAnalysis>>('/dashboard/changeover-analysis', {
          params: {
            from: from || undefined,
            to: to || undefined,
            lineId: lineId || undefined,
          },
        })
      ).data.data,
  });

  if (data.isLoading) return <LoadingBlock />;
  const d = data.data!;
  const k = d.kpis;

  return (
    <div>
      <PageHeader
        title="Changeover Analysis"
        subtitle="Standard vs actual time · Planned / Unplanned · By type & line"
      />

      <FilterBar>
        <FilterField label="From">
          <input className={FILTER_CTRL} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FilterField>
        <FilterField label="To">
          <input className={FILTER_CTRL} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
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
        <FilterField label="This month">
          <button
            type="button"
            className={`${FILTER_CTRL} cursor-pointer px-3 font-medium`}
            onClick={() => {
              setFrom(monthStartLocal());
              setTo(today());
            }}
          >
            This month
          </button>
        </FilterField>
      </FilterBar>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Changeovers" value={k.totalChangeovers.toLocaleString()} />
        <KpiCard label="Actual Minutes" value={k.totalActualMins.toLocaleString()} tone="warn" />
        <KpiCard label="Avg Mins / Changeover" value={k.avgMins.toLocaleString()} />
        <KpiCard
          label="Vs Standard"
          value={`${k.varianceMins >= 0 ? '+' : ''}${k.varianceMins}`}
          hint={`${k.overStandardCount} over standard`}
          tone={k.varianceMins > 0 ? 'bad' : 'good'}
        />
        <KpiCard label="Planned" value={k.plannedCount.toLocaleString()} tone="info" />
        <KpiCard label="Unplanned" value={k.unplannedCount.toLocaleString()} tone="warn" />
        <KpiCard label="Standard Minutes" value={k.totalStandardMins.toLocaleString()} />
        <KpiCard
          label="Efficiency"
          value={
            k.totalStandardMins > 0
              ? `${Math.min(100, Number(((k.totalStandardMins / Math.max(k.totalActualMins, 0.01)) * 100).toFixed(1)))}%`
              : '—'
          }
          hint="Standard ÷ Actual"
          tone="good"
        />
      </div>

      {d.trend.length === 0 && d.rows.length === 0 ? (
        <div className="panel p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
          No changeover entries in this date range. Add entries on Changeover Details first.
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Changeover Trend">
              <ResponsiveContainer>
                <LineChart data={d.trend} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="actualMins" name="Actual Mins" stroke="var(--chart-3)" strokeWidth={2}>
                    <ChartValueLabels />
                  </Line>
                  <Line yAxisId="left" type="monotone" dataKey="standardMins" name="Standard Mins" stroke="var(--chart-1)" strokeWidth={2}>
                    <ChartValueLabels />
                  </Line>
                  <Line yAxisId="right" type="monotone" dataKey="count" name="Count" stroke="var(--chart-2)" strokeWidth={2}>
                    <ChartValueLabels />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="By Changeover Type">
              <ResponsiveContainer>
                <BarChart data={d.byType} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="actualMins" name="Actual" fill="var(--chart-3)" radius={4}>
                    <ChartValueLabels />
                  </Bar>
                  <Bar dataKey="standardMins" name="Standard" fill="var(--chart-1)" radius={4}>
                    <ChartValueLabels />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="By Line">
              <ResponsiveContainer>
                <BarChart data={d.byLine} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Bar dataKey="actualMins" name="Actual Mins" fill="var(--chart-5)" radius={4}>
                    <ChartValueLabels />
                  </Bar>
                  <Bar dataKey="count" name="Count" fill="var(--chart-2)" radius={4}>
                    <ChartValueLabels />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Planned vs Unplanned">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={d.byKind} dataKey="actualMins" nameKey="name" outerRadius={95} label>
                    {d.byKind.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="table-wrap mt-5">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Line</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Type</th>
                  <th>Kind</th>
                  <th>Standard</th>
                  <th>Actual</th>
                  <th>Variance</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td>{r.line}</td>
                    <td>
                      {r.fromProduct}
                      {r.fromSku !== '—' ? ` · ${r.fromSku}` : ''}
                    </td>
                    <td>
                      {r.toProduct}
                      {r.toSku !== '—' ? ` · ${r.toSku}` : ''}
                    </td>
                    <td>{r.type}</td>
                    <td>
                      <Badge tone={r.kind === 'UNPLANNED' ? 'warn' : 'default'}>
                        {r.kind === 'UNPLANNED' ? 'Unplanned' : 'Planned'}
                      </Badge>
                    </td>
                    <td>{r.standardMins}</td>
                    <td>{r.actualMins}</td>
                    <td style={{ color: r.varianceMins > 0 ? 'var(--danger)' : 'var(--success)' }}>
                      {r.varianceMins > 0 ? '+' : ''}
                      {r.varianceMins}
                    </td>
                    <td>{r.reason}</td>
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

export function ManpowerAnalysisPage() {
  const today = () => todayLocal();
  const fmtAxisDate = (iso: string) => {
    if (!iso || iso.length < 10) return iso;
    const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };

  const [from, setFrom] = useState(() => monthStartLocal());
  const [to, setTo] = useState(() => today());
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
  });

  type ManpowerPayload = {
    from: string;
    to: string;
    kpis: {
      casesPerOperator: number;
      bottlesPerOperator: number;
      labourProductivity: number;
      labourUtilization: number;
      manpowerAvailability: number;
      manpowerLossCases: number;
      overtimeHours: number;
      idleLabourHours: number;
      actualCases: number;
      bottles: number;
      operators: number;
      present: number;
      plannedHeadcount: number;
      labourHours: number;
      availableHours: number;
      workingHours: number;
      shiftCount: number;
    };
    trend: Array<{
      date: string;
      casesPerOperator: number;
      labourProductivity: number;
      manpowerAvailability: number;
      idleLabourHours: number;
      overtimeHours: number;
    }>;
    byShift: Array<{
      name: string;
      casesPerOperator: number;
      labourProductivity: number;
      manpowerAvailability: number;
      manpowerLossCases: number;
      present: number;
      planned: number;
    }>;
    rows: Array<{
      id: string;
      date: string;
      shift: string;
      line: string;
      planned: number;
      present: number | null;
      operators: number | null;
      helpers: number | null;
      actualCases: number;
      casesPerOperator: number | null;
      bottlesPerOperator: number | null;
      labourProductivity: number | null;
      labourUtilization: number | null;
      manpowerAvailability: number | null;
      manpowerLossCases: number;
      overtimeHours: number;
      idleLabourHours: number;
    }>;
  };

  const report = useQuery({
    queryKey: ['manpower-analysis', from, to, lineId, shiftId],
    enabled: rangeValid,
    queryFn: async () =>
      (
        await api.get<ApiResponse<ManpowerPayload>>('/dashboard/manpower-analysis', {
          params: {
            from,
            to,
            ...(lineId ? { lineId } : {}),
            ...(shiftId ? { shiftId } : {}),
          },
        })
      ).data.data,
    staleTime: 60_000,
  });

  const filters = (
    <FilterBar columnsClassName="sm:grid-cols-2 lg:grid-cols-5">
      <FilterField label="From">
        <input
          className={FILTER_CTRL}
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => setFrom(e.target.value)}
        />
      </FilterField>
      <FilterField label="To">
        <input
          className={FILTER_CTRL}
          type="date"
          value={to}
          min={from || undefined}
          max={today()}
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
            setFrom(monthStartLocal());
            setTo(today());
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
        <PageHeader
          title="Manpower Analysis"
          subtitle="Labour productivity, utilisation & availability — with period filters"
        />
        {filters}
        <div className="panel p-6 text-sm" style={{ color: 'var(--danger)' }}>
          From date must be on or before To date.
        </div>
      </div>
    );
  }

  if (report.isError || lines.isError || shifts.isError) {
    const detail =
      (report.error as { response?: { data?: { message?: string } }; message?: string } | null)?.response?.data
        ?.message ||
      (report.error as { message?: string } | null)?.message ||
      'Failed to load manpower analysis.';
    return (
      <div>
        <PageHeader
          title="Manpower Analysis"
          subtitle="Labour productivity, utilisation & availability — with period filters"
        />
        {filters}
        <div className="panel p-6 text-sm" style={{ color: 'var(--danger)' }}>
          {detail}
        </div>
      </div>
    );
  }

  if (report.isLoading || lines.isLoading || shifts.isLoading || !report.data) {
    return (
      <div>
        <PageHeader
          title="Manpower Analysis"
          subtitle="Labour productivity, utilisation & availability — with period filters"
        />
        {filters}
        <LoadingBlock />
      </div>
    );
  }

  const d = report.data;
  const k = d.kpis;

  return (
    <div>
      <PageHeader
        title="Manpower Analysis"
        subtitle="Labour productivity, utilisation & availability — with period filters"
      />

      {filters}

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Cases / Operator"
          value={k.casesPerOperator.toLocaleString()}
          hint={`${k.actualCases.toLocaleString()} cases · ${k.operators} ops`}
        />
        <KpiCard
          label="Bottles / Operator"
          value={k.bottlesPerOperator.toLocaleString()}
          hint={`${k.bottles.toLocaleString()} bottles`}
          tone="info"
        />
        <KpiCard
          label="Labour Productivity"
          value={k.labourProductivity.toLocaleString()}
          hint={`${k.labourHours} labour hours`}
        />
        <KpiCard
          label="Labour Utilisation"
          value={`${k.labourUtilization}%`}
          hint={`${k.workingHours} / ${k.availableHours} h`}
          tone={k.labourUtilization >= 85 ? 'good' : k.labourUtilization >= 70 ? 'warn' : 'bad'}
        />
        <KpiCard
          label="Manpower Availability"
          value={`${k.manpowerAvailability}%`}
          hint={`${k.present} present / ${k.plannedHeadcount} planned`}
          tone={k.manpowerAvailability >= 95 ? 'good' : k.manpowerAvailability >= 85 ? 'warn' : 'bad'}
        />
        <KpiCard
          label="Prod. Loss (Manpower)"
          value={k.manpowerLossCases.toLocaleString()}
          hint="Cases lost to short staff"
          tone="warn"
        />
        <KpiCard label="Overtime Hours" value={k.overtimeHours.toLocaleString()} hint="Total OT hours" />
        <KpiCard
          label="Idle Labour Hours"
          value={k.idleLabourHours.toLocaleString()}
          hint="Waiting + breakdown"
          tone="bad"
        />
      </div>

      {d.rows.length === 0 ? (
        <div className="panel p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
          No shift data in this date range. Record production and manpower first.
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Cases / Operator Trend">
              <ResponsiveContainer>
                <LineChart data={d.trend} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={fmtAxisDate} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip labelFormatter={(v) => fmtAxisDate(String(v))} />
                  <Line type="monotone" dataKey="casesPerOperator" name="Cases/Op" stroke="var(--chart-1)" strokeWidth={2}>
                    <ChartValueLabels />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Labour Productivity">
              <ResponsiveContainer>
                <LineChart data={d.trend} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={fmtAxisDate} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip labelFormatter={(v) => fmtAxisDate(String(v))} />
                  <Line type="monotone" dataKey="labourProductivity" name="Cases/hr" stroke="var(--chart-3)" strokeWidth={2}>
                    <ChartValueLabels />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Availability by Shift">
              <ResponsiveContainer>
                <BarChart data={d.byShift} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Bar dataKey="manpowerAvailability" name="Availability %" fill="var(--chart-2)" radius={4}>
                    <ChartValueLabels suffix="%" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Idle Labour & Overtime">
              <ResponsiveContainer>
                <LineChart data={d.trend} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={fmtAxisDate} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip labelFormatter={(v) => fmtAxisDate(String(v))} />
                  <Legend />
                  <Line type="monotone" dataKey="idleLabourHours" name="Idle Hours" stroke="var(--chart-4)" strokeWidth={2}>
                    <ChartValueLabels />
                  </Line>
                  <Line type="monotone" dataKey="overtimeHours" name="OT Hours" stroke="var(--chart-5)" strokeWidth={2}>
                    <ChartValueLabels />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="mb-2 mt-5 text-sm font-semibold">Shift-wise Detail ({d.rows.length})</div>
          <div className="table-wrap fit-cols panel">
            <table className="data entry-log">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Shift</th>
                  <th>Line</th>
                  <th>Present</th>
                  <th>Planned</th>
                  <th>Avail %</th>
                  <th>Cases</th>
                  <th>Cases/Op</th>
                  <th>Prod/hr</th>
                  <th>Util %</th>
                  <th>Loss</th>
                  <th>OT h</th>
                  <th>Idle h</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtAxisDate(r.date)}</td>
                    <td className="font-medium">{r.shift}</td>
                    <td>{r.line}</td>
                    <td className="tabular-nums">{r.present ?? '—'}</td>
                    <td className="tabular-nums">{r.planned}</td>
                    <td className="tabular-nums">{r.manpowerAvailability == null ? '—' : `${r.manpowerAvailability}%`}</td>
                    <td className="tabular-nums">{r.actualCases}</td>
                    <td className="tabular-nums">{r.casesPerOperator ?? '—'}</td>
                    <td className="tabular-nums">{r.labourProductivity ?? '—'}</td>
                    <td className="tabular-nums">{r.labourUtilization == null ? '—' : `${r.labourUtilization}%`}</td>
                    <td className="tabular-nums" style={{ color: r.manpowerLossCases > 0 ? 'var(--danger)' : undefined }}>
                      {r.manpowerLossCases}
                    </td>
                    <td className="tabular-nums">{r.overtimeHours}</td>
                    <td className="tabular-nums">{r.idleLabourHours}</td>
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

export function MonitoringPage() {
  return <PlanVsActualPage />;
}

export function ApprovalsPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['approvals'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{
        id: string;
        actualCases: number;
        plannedCases: number;
        status: string;
        createdBy: { firstName: string; lastName: string };
        plan: { planNumber: string; line: { name: string }; product: { name: string }; shift: { name: string } };
      }>>>('/dashboard/pending-approvals')).data.data,
  });

  const approve = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'APPROVED' | 'REJECTED' }) =>
      api.post(`/production-entries/${id}/approve`, { status }),
    onSuccess: async () => {
      toast.success('Updated');
      await qc.invalidateQueries({ queryKey: ['approvals'] });
    },
  });

  if (list.isLoading) return <LoadingBlock />;
  return (
    <div>
      <PageHeader title="Approve Production Entries" subtitle="Review submitted hourly production entries" />
      <div className="table-wrap panel">
        <table className="data">
          <thead>
            <tr>
              <th>Work Order</th><th>Line</th><th>Shift</th><th>Product</th><th>Planned</th><th>Actual</th><th>Entered By</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((e) => (
              <tr key={e.id}>
                <td className="font-mono">{formatWorkOrder(e.plan.planNumber)}</td>
                <td>{e.plan.line.name}</td>
                <td>{e.plan.shift.name}</td>
                <td>{e.plan.product.name}</td>
                <td>{e.plannedCases}</td>
                <td>{e.actualCases}</td>
                <td>{e.createdBy.firstName} {e.createdBy.lastName}</td>
                <td><StatusBadge status={e.status} /></td>
                <td className="space-x-2">
                  <button className="btn btn-primary" onClick={() => approve.mutate({ id: e.id, status: 'APPROVED' })}>Approve</button>
                  <button className="btn btn-danger" onClick={() => approve.mutate({ id: e.id, status: 'REJECTED' })}>Reject</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ReportsPage() {
  const [type, setType] = useState('daily');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const report = useQuery({
    queryKey: ['report', type, from, to],
    queryFn: async () => (await api.get<ApiResponse<Array<Record<string, unknown>>>>(`/reports/${type}`, { params: { from: from || undefined, to: to || undefined } })).data.data,
  });

  async function download(format: 'excel' | 'pdf') {
    const res = await api.get(`/reports/${type}/export/${format}`, {
      params: { from: from || undefined, to: to || undefined },
      responseType: 'blob',
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-report.${format === 'excel' ? 'xlsx' : 'pdf'}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const rows = report.data ?? [];
  const keys = rows[0] ? Object.keys(rows[0]) : [];

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Daily, shift, line, OEE, downtime, changeover, machine, and supervisor reports"
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => download('excel')}>Export Excel</button>
            <button className="btn btn-secondary" onClick={() => download('pdf')}>Export PDF</button>
          </>
        }
      />
      <FilterBar columnsClassName="sm:grid-cols-2 md:grid-cols-4">
        <FilterField label="Report Type">
          <select className={FILTER_CTRL} value={type} onChange={(e) => setType(e.target.value)}>
            {['daily', 'shift', 'line', 'oee', 'downtime', 'changeover', 'machine', 'supervisor'].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="From">
          <input className={FILTER_CTRL} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FilterField>
        <FilterField label="To">
          <input className={FILTER_CTRL} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </FilterField>
      </FilterBar>
      {report.isLoading ? <LoadingBlock /> : (
        <div className="table-wrap panel">
          <table className="data">
            <thead>
              <tr>{keys.map((k) => <th key={k}>{k}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>{keys.map((k) => <td key={k}>{String(row[k] ?? '')}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function NotificationsPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['notifications-page'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; title: string; message: string; type: string; isRead: boolean; createdAt: string }>>>('/notifications')).data.data,
  });
  const readAll = useMutation({
    mutationFn: async () => api.post('/notifications/read-all'),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['notifications-page'] });
      await qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
  return (
    <div>
      <PageHeader title="Notifications" actions={<button className="btn btn-secondary" onClick={() => readAll.mutate()}>Mark all read</button>} />
      <div className="space-y-3">
        {(list.data ?? []).map((n) => (
          <div key={n.id} className="panel p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold">{n.title}</div>
              <Badge tone={n.isRead ? 'default' : 'warn'}>{n.type}</Badge>
            </div>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{n.message}</p>
            <div className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>{new Date(n.createdAt).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AuditLogsPage() {
  const list = useQuery({
    queryKey: ['audit'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; action: string; entity: string; createdAt: string; actor?: { firstName: string; lastName: string } }>>>('/audit-logs', { params: { limit: 100 } })).data.data,
  });
  if (list.isLoading) return <LoadingBlock />;
  return (
    <div>
      <PageHeader title="Audit Logs" />
      <div className="table-wrap panel">
        <table className="data">
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th></tr></thead>
          <tbody>
            {(list.data ?? []).map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.createdAt).toLocaleString()}</td>
                <td>{a.actor ? `${a.actor.firstName} ${a.actor.lastName}` : 'System'}</td>
                <td>{a.action}</td>
                <td>{a.entity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const [key, setKey] = useState('oee.target');
  const [value, setValue] = useState('85');
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get<ApiResponse<Array<{ id: string; key: string; value: unknown; description?: string }>>>('/settings')).data.data,
  });
  const save = useMutation({
    mutationFn: async () => api.put('/settings', { key, value: isNaN(Number(value)) ? value : Number(value) }),
    onSuccess: async () => {
      toast.success('Setting saved');
      await qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
  return (
    <div>
      <PageHeader title="Settings" />
      <FilterBar columnsClassName="sm:grid-cols-2 md:grid-cols-3">
        <FilterField label="Key">
          <input className={FILTER_CTRL} value={key} onChange={(e) => setKey(e.target.value)} />
        </FilterField>
        <FilterField label="Value">
          <input className={FILTER_CTRL} value={value} onChange={(e) => setValue(e.target.value)} />
        </FilterField>
        <FilterField label="Save">
          <button
            type="button"
            className={`${FILTER_CTRL} cursor-pointer px-3 font-medium`}
            onClick={() => save.mutate()}
          >
            Save
          </button>
        </FilterField>
      </FilterBar>
      <div className="table-wrap panel">
        <table className="data">
          <thead><tr><th>Key</th><th>Value</th><th>Description</th></tr></thead>
          <tbody>
            {(list.data ?? []).map((s) => (
              <tr key={s.id}><td className="font-mono">{s.key}</td><td>{JSON.stringify(s.value)}</td><td>{s.description}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', currentPassword: '', newPassword: '' });
  const profile = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.get<ApiResponse<{ firstName: string; lastName: string; phone?: string; email: string; role: string; employeeId: string }>>('/auth/me')).data.data,
  });

  const saveProfile = useMutation({
    mutationFn: async () =>
      api.patch('/auth/profile', {
        firstName: form.firstName || profile.data?.firstName,
        lastName: form.lastName || profile.data?.lastName,
        phone: form.phone || profile.data?.phone,
      }),
    onSuccess: () => toast.success('Profile updated'),
  });
  const changePassword = useMutation({
    mutationFn: async () =>
      api.post('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      }),
    onSuccess: () => toast.success('Password changed'),
    onError: (e: unknown) =>
      toast.error(
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed',
      ),
  });

  if (profile.isLoading) return <LoadingBlock />;
  const p = profile.data!;

  return (
    <div>
      <PageHeader title="Profile Management" subtitle={`${p.employeeId} · ${p.role}`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <h3 className="mb-3 font-semibold">Profile</h3>
          <Field label="Email"><input className="input" value={p.email} disabled /></Field>
          <Field label="First Name"><input className="input" defaultValue={p.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
          <Field label="Last Name"><input className="input" defaultValue={p.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
          <Field label="Phone"><input className="input" defaultValue={p.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <button className="btn btn-primary" onClick={() => saveProfile.mutate()}>Save Profile</button>
        </div>
        <div className="panel p-4">
          <h3 className="mb-3 font-semibold">Change Password</h3>
          <Field label="Current Password"><input className="input" type="password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} /></Field>
          <Field label="New Password"><input className="input" type="password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} /></Field>
          <button className="btn btn-primary" onClick={() => changePassword.mutate()}>Update Password</button>
        </div>
      </div>
    </div>
  );
}
