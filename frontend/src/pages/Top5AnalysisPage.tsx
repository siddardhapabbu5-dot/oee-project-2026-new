import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
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
import { ChartValueLabels } from '../components/chartLabels';
import { FilterBar, FilterField, FILTER_CTRL } from '../components/FilterBar';
import { ChartCard, KpiCard, LoadingBlock, PageHeader } from '../components/ui';

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

type RankRow = {
  rank: number;
  name: string;
  product: string;
  sku: string;
  planned: number;
  actual: number;
  variance: number;
  achievement: number;
};

function localYmd(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** First → last day of YYYY-MM (to capped at today for current month). */
function rangeForMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return { from: localYmd(), to: localYmd() };
  const from = localYmd(new Date(y, m - 1, 1));
  const last = localYmd(new Date(y, m, 0));
  const today = localYmd();
  return { from, to: last > today ? today : last };
}

function achievementOf(planned: number, actual: number) {
  if (planned <= 0) return actual > 0 ? 100 : 0;
  return Number(((actual / planned) * 100).toFixed(2));
}

function topN<T>(rows: T[], n: number, score: (r: T) => number, desc = true): Array<T & { rank: number }> {
  const sorted = [...rows].sort((a, b) => (desc ? score(b) - score(a) : score(a) - score(b)));
  return sorted.slice(0, n).map((r, i) => ({ ...r, rank: i + 1 }));
}

function RankTable({
  title,
  rows,
  accent,
}: {
  title: string;
  rows: RankRow[];
  accent?: 'good' | 'bad' | 'neutral';
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="border-b px-4 py-3 font-semibold" style={{ borderColor: 'var(--border)' }}>
        {title}
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>#</th>
              <th>Product</th>
              <th>SKU</th>
              <th>Planned</th>
              <th>Actual</th>
              <th>Variance</th>
              <th>Achievement %</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ color: 'var(--muted)' }}>
                  No data in this range
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={`${title}-${r.rank}-${r.product}-${r.sku}`}>
                  <td className="font-semibold">{r.rank}</td>
                  <td className="font-medium">{r.product}</td>
                  <td>{r.sku}</td>
                  <td className="tabular-nums">{r.planned.toLocaleString()}</td>
                  <td className="tabular-nums">{r.actual.toLocaleString()}</td>
                  <td
                    className="tabular-nums font-medium"
                    style={{
                      color:
                        r.variance < 0 ? 'var(--danger)' : r.variance > 0 ? 'var(--success)' : undefined,
                    }}
                  >
                    {r.variance > 0 ? '+' : ''}
                    {r.variance.toLocaleString()}
                  </td>
                  <td
                    className="tabular-nums font-semibold"
                    style={{
                      color:
                        accent === 'good' || r.achievement >= 95
                          ? 'var(--success)'
                          : accent === 'bad' || r.achievement < 90
                            ? 'var(--danger)'
                            : 'var(--warn, #ca8a04)',
                    }}
                  >
                    {r.achievement.toFixed(2)}%
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

export default function Top5AnalysisPage() {
  const initial = rangeForMonth(currentMonth());
  const [month, setMonth] = useState(currentMonth);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [brandId, setBrandId] = useState('');
  const [packVolume, setPackVolume] = useState('');
  const rangeValid = Boolean(from && to && from <= to);

  const brands = useQuery({
    queryKey: ['brands-pva'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/brands', { params: { limit: 200 } })).data
        .data,
    staleTime: 300_000,
  });

  const skus = useQuery({
    queryKey: ['skus-pva'],
    queryFn: async () =>
      (
        await api.get<
          ApiResponse<Array<{ id: string; code: string; name: string; packVolume?: string | null }>>
        >('/skus', { params: { limit: 500 } })
      ).data.data,
    staleTime: 300_000,
  });

  const PACK_VOLUME_ORDER = ['200 ML', '250 ML', '300 ML', '500 ML', '750 ML', '1000 ML', '2000 ML', 'Jar-20L'];
  const skuPackOptions = useMemo(() => {
    const found = new Set<string>();
    for (const s of skus.data ?? []) {
      const label = (s.packVolume || '').trim();
      if (label) found.add(label);
    }
    const ordered = PACK_VOLUME_ORDER.filter((p) => [...found].some((f) => f.toLowerCase() === p.toLowerCase()));
    const extras = [...found].filter((p) => !PACK_VOLUME_ORDER.some((o) => o.toLowerCase() === p.toLowerCase()));
    return [...ordered, ...extras.sort()];
  }, [skus.data]);

  const report = useQuery({
    queryKey: ['top5-analysis', from, to, brandId, packVolume],
    enabled: rangeValid,
    queryFn: async () =>
      (
        await api.get<ApiResponse<PvaPayload>>('/dashboard/plan-vs-actual', {
          params: {
            from,
            to,
            ...(brandId ? { brandId } : {}),
            ...(packVolume ? { packVolume } : {}),
          },
        })
      ).data.data,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const rankings = useMemo(() => {
    const skuMap = new Map<string, { name: string; product: string; sku: string; planned: number; actual: number }>();
    const skuRows = report.data?.skuRows ?? [];
    if (skuRows.length > 0) {
      for (const r of skuRows) {
        const sku = (r.sku || '—').trim() || '—';
        const product = r.product || 'Unassigned';
        const key = `${r.productId}::${sku.toUpperCase()}`;
        const cur = skuMap.get(key) ?? { name: `${product} · ${sku}`, product, sku, planned: 0, actual: 0 };
        cur.planned += r.plannedCases;
        cur.actual += r.actualCases;
        skuMap.set(key, cur);
      }
    } else {
      for (const c of report.data?.chart ?? []) {
        skuMap.set(c.product, {
          name: c.product,
          product: c.product,
          sku: '—',
          planned: c.planned,
          actual: c.actual,
        });
      }
    }

    const skuList = [...skuMap.values()].map((s) => ({
      ...s,
      variance: Number((s.actual - s.planned).toFixed(2)),
      achievement: achievementOf(s.planned, s.actual),
    }));

    const toRank = (rows: typeof skuList): RankRow[] =>
      rows.map((r, i) => ({
        rank: i + 1,
        name: r.name,
        product: r.product,
        sku: r.sku,
        planned: r.planned,
        actual: r.actual,
        variance: r.variance,
        achievement: r.achievement,
      }));

    const byPlanned = toRank(topN(skuList, 5, (r) => r.planned));
    const byActual = toRank(topN(skuList, 5, (r) => r.actual));
    const byAchievement = toRank(topN(skuList.filter((r) => r.planned > 0), 5, (r) => r.achievement));
    const byShortfall = toRank(topN(skuList, 5, (r) => r.variance, false));

    return { byPlanned, byActual, byAchievement, byShortfall, skuList };
  }, [report.data]);

  const filters = (
    <FilterBar columnsClassName="sm:grid-cols-2 lg:grid-cols-6">
      <FilterField label="Month">
        <input
          className={FILTER_CTRL}
          type="month"
          value={month}
          max={currentMonth()}
          onChange={(e) => {
            const ym = e.target.value;
            setMonth(ym);
            const r = rangeForMonth(ym);
            setFrom(r.from);
            setTo(r.to);
          }}
        />
      </FilterField>
      <FilterField label="From">
        <input
          className={FILTER_CTRL}
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => {
            setFrom(e.target.value);
            if (e.target.value.slice(0, 7) === to.slice(0, 7)) setMonth(e.target.value.slice(0, 7));
          }}
        />
      </FilterField>
      <FilterField label="To">
        <input
          className={FILTER_CTRL}
          type="date"
          value={to}
          min={from || undefined}
          max={localYmd()}
          onChange={(e) => {
            setTo(e.target.value);
            if (from.slice(0, 7) === e.target.value.slice(0, 7)) setMonth(e.target.value.slice(0, 7));
          }}
        />
      </FilterField>
      <FilterField label="Brand">
        <select className={FILTER_CTRL} value={brandId} onChange={(e) => setBrandId(e.target.value)}>
          <option value="">All brands</option>
          {(brands.data ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField label="SKU">
        <select className={FILTER_CTRL} value={packVolume} onChange={(e) => setPackVolume(e.target.value)}>
          <option value="">All SKUs</option>
          {skuPackOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField label="Reset">
        <button
          type="button"
          className={`${FILTER_CTRL} cursor-pointer px-3 font-medium`}
          onClick={() => {
            const ym = currentMonth();
            const r = rangeForMonth(ym);
            setMonth(ym);
            setFrom(r.from);
            setTo(r.to);
            setBrandId('');
            setPackVolume('');
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
        <PageHeader title="Top 5 Analysis" subtitle="Plan vs Actual rankings for management" />
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
        <PageHeader title="Top 5 Analysis" subtitle="Plan vs Actual rankings for management" />
        {filters}
        <div className="panel p-6 text-sm" style={{ color: 'var(--danger)' }}>
          Failed to load Top 5 analysis.
        </div>
      </div>
    );
  }

  if (report.isLoading || !report.data) {
    return (
      <div>
        <PageHeader title="Top 5 Analysis" subtitle="Plan vs Actual rankings for management" />
        {filters}
        <LoadingBlock />
      </div>
    );
  }

  const t = report.data.totals;

  return (
    <div>
      <PageHeader
        title="Top 5 Analysis"
        subtitle="SKU-wise rankings — product + pack size · planned, actual, achievement, and shortfall"
      />
      {filters}

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Planned Cases" value={t.plannedCases.toLocaleString()} />
        <KpiCard label="Actual Cases" value={t.actualCases.toLocaleString()} tone="info" />
        <KpiCard
          label="Variance"
          value={`${t.variance > 0 ? '+' : ''}${t.variance.toLocaleString()}`}
          tone={t.variance < 0 ? 'bad' : t.variance > 0 ? 'good' : undefined}
          hint="Actual − Planned"
        />
        <KpiCard
          label="Achievement"
          value={`${t.achievement}%`}
          tone={t.achievement >= 95 ? 'good' : t.achievement < 90 ? 'bad' : 'warn'}
          hint="Actual ÷ Planned"
        />
      </div>

      {rankings.skuList.length === 0 ? (
        <div className="panel p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
          No plan vs actual data in this range. Add work orders and production entries first.
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Top 5 by Planned Cases (SKU)">
              <ResponsiveContainer>
                <BarChart data={rankings.byPlanned} margin={{ top: 18, right: 8, left: 0, bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-20} textAnchor="end" height={58} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Bar dataKey="planned" name="Planned" fill="var(--chart-2)" radius={4}>
                    <ChartValueLabels />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top 5 by Actual Cases (SKU)">
              <ResponsiveContainer>
                <BarChart data={rankings.byActual} margin={{ top: 18, right: 8, left: 0, bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-20} textAnchor="end" height={58} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Bar dataKey="actual" name="Actual" fill="var(--chart-1)" radius={4}>
                    <ChartValueLabels />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top 5 Planned vs Actual (SKU)">
              <ResponsiveContainer>
                <BarChart data={rankings.byPlanned} margin={{ top: 22, right: 8, left: 0, bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-20} textAnchor="end" height={58} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="planned" name="Planned" fill="var(--chart-2)" radius={4}>
                    <ChartValueLabels />
                  </Bar>
                  <Bar dataKey="actual" name="Actual" fill="var(--chart-1)" radius={4}>
                    <ChartValueLabels />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top 5 by Achievement % (SKU)">
              <ResponsiveContainer>
                <BarChart data={rankings.byAchievement} margin={{ top: 18, right: 8, left: 0, bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-20} textAnchor="end" height={58} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                  <Tooltip />
                  <Bar dataKey="achievement" name="Achievement %" fill="var(--chart-5)" radius={4}>
                    <ChartValueLabels />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top 5 Shortfall (SKU)">
              <ResponsiveContainer>
                <BarChart data={rankings.byShortfall} margin={{ top: 18, right: 8, left: 0, bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-20} textAnchor="end" height={58} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Bar dataKey="variance" name="Variance (cases)" fill="var(--chart-3)" radius={4}>
                    <ChartValueLabels />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <RankTable title="Top 5 — Planned volume (SKU)" rows={rankings.byPlanned} />
            <RankTable title="Top 5 — Actual volume (SKU)" rows={rankings.byActual} />
            <RankTable title="Top 5 — Achievement % (SKU)" rows={rankings.byAchievement} accent="good" />
            <RankTable title="Top 5 — Largest shortfall (SKU)" rows={rankings.byShortfall} accent="bad" />
          </div>
        </>
      )}
    </div>
  );
}
