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
import { CalendarRange } from 'lucide-react';
import api, { type ApiResponse } from '../lib/api';
import { ChartCard, Field, KpiCard, LoadingBlock, PageHeader } from '../components/ui';
import { downtimeColor, downtimeTone, metricColor, metricTone } from '../lib/metricBands';

type WeekRow = {
  week: number;
  label: string;
  range: string;
  plannedCases: number;
  actualCases: number;
  goodCases: number;
  rejectCases: number;
  productionLoss: number;
  achievement: number;
  downtimeMins: number;
  plannedProductionTimeMins: number;
  operatingTimeMins: number;
  availability: number;
  performance: number;
  quality: number;
  oee: number;
};

type WeekWisePayload = {
  month: string;
  weeks: WeekRow[];
  totals: {
    plannedCases: number;
    actualCases: number;
    downtimeMins: number;
    achievement: number;
    oee: number;
    availability: number;
    performance: number;
    quality: number;
  };
  charts: {
    oeeByWeek: Array<{ week: string; oee: number; availability: number; performance: number; quality: number }>;
    planVsActual: Array<{ week: string; planned: number; actual: number }>;
    downtimeByWeek: Array<{ week: string; downtime: number }>;
  };
};

const WEEK_OPTIONS = [
  { value: '', label: 'All weeks' },
  { value: '1', label: 'Week-01 (1–7)' },
  { value: '2', label: 'Week-02 (8–14)' },
  { value: '3', label: 'Week-03 (15–21)' },
  { value: '4', label: 'Week-04 (22–end)' },
] as const;

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtMonth(ym: string) {
  const d = new Date(`${ym}-01T12:00:00`);
  if (Number.isNaN(d.getTime())) return ym;
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function weekKpis(w: WeekRow) {
  return {
    plannedCases: w.plannedCases,
    actualCases: w.actualCases,
    downtimeMins: w.downtimeMins,
    achievement: w.achievement,
    oee: w.oee,
    availability: w.availability,
    performance: w.performance,
    quality: w.quality,
  };
}

export default function WeekWiseOeePage() {
  const [month, setMonth] = useState(() => currentMonth());
  const [weekFilter, setWeekFilter] = useState('');
  const [lineId, setLineId] = useState('');

  const lines = useQuery({
    queryKey: ['lines-week-wise'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string; code: string }>>>('/lines', { params: { limit: 100 } }))
        .data.data,
  });

  const report = useQuery({
    queryKey: ['week-wise-oee', month, lineId],
    enabled: Boolean(month),
    queryFn: async () =>
      (
        await api.get<ApiResponse<WeekWisePayload>>('/dashboard/week-wise', {
          params: {
            month,
            ...(lineId ? { lineId } : {}),
          },
        })
      ).data.data,
  });

  const allWeeks = report.data?.weeks ?? [];
  const selectedWeek = weekFilter ? Number(weekFilter) : null;

  const weeks = useMemo(() => {
    if (!selectedWeek) return allWeeks;
    return allWeeks.filter((w) => w.week === selectedWeek);
  }, [allWeeks, selectedWeek]);

  const t = useMemo(() => {
    if (!report.data) return null;
    if (!selectedWeek) return report.data.totals;
    const w = allWeeks.find((row) => row.week === selectedWeek);
    return w ? weekKpis(w) : report.data.totals;
  }, [report.data, allWeeks, selectedWeek]);

  const charts = useMemo(() => {
    if (!report.data?.charts) return null;
    if (!selectedWeek) return report.data.charts;
    const label = `Week-${String(selectedWeek).padStart(2, '0')}`;
    return {
      oeeByWeek: (report.data.charts.oeeByWeek ?? []).filter((r) => r.week === label),
      planVsActual: (report.data.charts.planVsActual ?? []).filter((r) => r.week === label),
      downtimeByWeek: (report.data.charts.downtimeByWeek ?? []).filter((r) => r.week === label),
    };
  }, [report.data?.charts, selectedWeek]);

  const kpiScopeLabel = selectedWeek ? `Week-${String(selectedWeek).padStart(2, '0')}` : 'Month';

  return (
    <div>
      <PageHeader
        title="Week-wise OEE"
        subtitle="Monthly trend by Week-01 · Week-02 · Week-03 · Week-04 (days 1–7 / 8–14 / 15–21 / 22–end)"
        actions={
          <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }}>
            <CalendarRange size={16} />
            {fmtMonth(month)}
            {selectedWeek ? ` · Week-${String(selectedWeek).padStart(2, '0')}` : ''}
          </span>
        }
      />

      <div className="panel mb-4 flex flex-wrap items-end gap-3 p-4">
        <Field label="Month">
          <input
            type="month"
            className="input"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setWeekFilter('');
            }}
          />
        </Field>
        <Field label="Week">
          <select
            className="input min-w-[12rem]"
            value={weekFilter}
            onChange={(e) => setWeekFilter(e.target.value)}
          >
            {WEEK_OPTIONS.map((o) => (
              <option key={o.value || 'all'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Line">
          <select className="input min-w-[12rem]" value={lineId} onChange={(e) => setLineId(e.target.value)}>
            <option value="">All lines</option>
            {(lines.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.code ? `${l.code} — ${l.name}` : l.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {report.isLoading ? (
        <LoadingBlock />
      ) : !report.data || !t ? (
        <div className="panel p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
          No data for this month.
        </div>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
            <KpiCard label={`${kpiScopeLabel} OEE`} value={`${t.oee}%`} tone={metricTone('oee', t.oee)} hint="A × P × Q" />
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
            <KpiCard
              label="Downtime (min)"
              value={Math.round(t.downtimeMins).toLocaleString()}
              tone={downtimeTone(t.downtimeMins)}
            />
          </div>

          <div className="mb-4 grid gap-4 xl:grid-cols-2">
            <ChartCard title={selectedWeek ? `${kpiScopeLabel} OEE (A / P / Q)` : 'Weekly OEE (A / P / Q)'}>
              <ResponsiveContainer>
                <BarChart data={charts?.oeeByWeek ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="oee" name="OEE %" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="availability" name="A %" fill="var(--pillar-availability)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="performance" name="P %" fill="var(--pillar-performance)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="quality" name="Q %" fill="var(--pillar-quality)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title={selectedWeek ? `${kpiScopeLabel} Plan vs Actual` : 'Weekly Plan vs Actual'}>
              <ResponsiveContainer>
                <BarChart data={charts?.planVsActual ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="planned" name="Planned" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" name="Actual" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="mb-4">
            <ChartCard title={selectedWeek ? `${kpiScopeLabel} Downtime (min)` : 'Weekly Downtime (min)'}>
              <ResponsiveContainer>
                <BarChart data={charts?.downtimeByWeek ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="downtime" name="Downtime (min)" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="mb-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Week detail ({weeks.length} week{weeks.length === 1 ? '' : 's'})
          </div>
          <div className="table-wrap fit-cols panel">
            <table className="data day-wise-oee">
              <thead>
                <tr>
                  <th>Week</th>
                  <th>Days</th>
                  <th>Planned</th>
                  <th>Actual</th>
                  <th>Ach %</th>
                  <th>Downtime</th>
                  <th>Operating</th>
                  <th>Avail %</th>
                  <th>Perf %</th>
                  <th>Qual %</th>
                  <th>OEE %</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.week}>
                    <td className="font-semibold">{w.label}</td>
                    <td className="tabular-nums">{w.range}</td>
                    <td className="tabular-nums">{w.plannedCases.toLocaleString()}</td>
                    <td className="tabular-nums">{w.actualCases.toLocaleString()}</td>
                    <td className="tabular-nums font-semibold" style={{ color: metricColor('achievement', w.achievement) }}>
                      {w.achievement.toFixed(1)}%
                    </td>
                    <td className="tabular-nums font-semibold" style={{ color: downtimeColor(w.downtimeMins) }}>
                      {Math.round(w.downtimeMins).toLocaleString()}
                    </td>
                    <td className="tabular-nums">{Math.round(w.operatingTimeMins).toLocaleString()}</td>
                    <td className="tabular-nums font-semibold" style={{ color: metricColor('availability', w.availability) }}>
                      {w.availability.toFixed(1)}%
                    </td>
                    <td className="tabular-nums font-semibold" style={{ color: metricColor('performance', w.performance) }}>
                      {w.performance.toFixed(1)}%
                    </td>
                    <td className="tabular-nums font-semibold" style={{ color: metricColor('quality', w.quality) }}>
                      {w.quality.toFixed(1)}%
                    </td>
                    <td className="tabular-nums font-semibold" style={{ color: metricColor('oee', w.oee) }}>
                      {w.oee.toFixed(1)}%
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
