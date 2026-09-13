import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { AlertTriangle, ArrowDown, ArrowUp, Wrench } from 'lucide-react';
import api, { type ApiResponse } from '../lib/api';
import { ChartValueLabels } from '../components/chartLabels';
import { FilterBar, FilterField, FILTER_CTRL } from '../components/FilterBar';
import { ChartCard, KpiCard, LoadingBlock, PageHeader, Badge } from '../components/ui';
import {
  metricTone,
  mtbfBand,
  mttrBand,
  reliabilityBandTone,
  RELIABILITY_BAND_LABEL,
  MTBF_TARGET_MINS,
  MTTR_TARGET_MINS,
} from '../lib/metricBands';

type MaintenancePayload = {
  from: string;
  to: string;
  targets: { mtbfMins: number; mttrMins: number };
  dataSource: string;
  kpis: {
    plannedProductionMins: number;
    operatingTime: number;
    breakdownMins: number;
    failures: number;
    mtbf: number;
    mttr: number;
    availability: number;
    reliability: number;
  };
  mtbfTrend: Array<{ period: string; label: string; mtbf: number; mttr: number; failures: number }>;
  mttrTrend: Array<{ period: string; label: string; mttr: number }>;
  byMachine: Array<{
    machineId: string | null;
    name: string;
    mtbf: number;
    mttr: number;
    failures: number;
    breakdownMins: number;
    availability: number;
  }>;
  paretoReasons: Array<{ name: string; count: number; minutes: number }>;
  repeatFailures: Array<{
    machine: string;
    reason: string;
    occurrences: number;
    totalMins: number;
    mttr: number;
    alert: boolean;
  }>;
  maintenanceMix: Array<{ name: string; count: number; minutes: number }>;
  alerts: Array<{ message: string; machine: string; reason: string; occurrences: number }>;
  breakdownHistory: Array<{
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
    status: string;
  }>;
};

function localYmd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthStartLocal() {
  const d = new Date();
  return localYmd(new Date(d.getFullYear(), d.getMonth(), 1));
}

function todayLocal() {
  return localYmd(new Date());
}

function fmtMins(m: number) {
  return `${Number(m).toLocaleString(undefined, { maximumFractionDigits: 1 })} min`;
}

function fmtPct(n: number) {
  return `${Number(n).toFixed(1)}%`;
}

function HorizontalBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_4rem] items-center gap-2 text-sm">
      <span className="truncate" title={label}>
        {label}
      </span>
      <div className="h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--chart-1)' }} />
      </div>
      <span className="text-right tabular-nums" style={{ color: 'var(--muted)' }}>
        {value}
      </span>
    </div>
  );
}

export default function MaintenanceReliabilityPage() {
  const [from, setFrom] = useState(() => monthStartLocal());
  const [to, setTo] = useState(() => todayLocal());
  const [plantId, setPlantId] = useState('');
  const [lineId, setLineId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [shiftId, setShiftId] = useState('');
  const historyRef = useRef<HTMLDivElement>(null);
  const rangeValid = Boolean(from && to && from <= to);

  const plants = useQuery({
    queryKey: ['plants-maint'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/plants', { params: { limit: 50 } })).data
        .data,
    staleTime: 300_000,
  });

  const lines = useQuery({
    queryKey: ['lines-maint', plantId],
    queryFn: async () =>
      (
        await api.get<ApiResponse<Array<{ id: string; name: string; code?: string }>>>('/lines', {
          params: { limit: 100, plantId: plantId || undefined },
        })
      ).data.data,
    staleTime: 300_000,
  });

  const machines = useQuery({
    queryKey: ['machines-maint', lineId],
    queryFn: async () =>
      (
        await api.get<ApiResponse<Array<{ id: string; name: string; code?: string }>>>('/machines', {
          params: { limit: 200, lineId: lineId || undefined },
        })
      ).data.data,
    staleTime: 300_000,
  });

  const shifts = useQuery({
    queryKey: ['shifts-maint'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/shifts')).data.data,
    staleTime: 300_000,
  });

  const data = useQuery({
    queryKey: ['maintenance-reliability', from, to, plantId, lineId, machineId, shiftId],
    enabled: rangeValid,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (
        await api.get<ApiResponse<MaintenancePayload>>('/dashboard/maintenance-reliability', {
          params: {
            from,
            to,
            plantId: plantId || undefined,
            lineId: lineId || undefined,
            machineId: machineId || undefined,
            shiftId: shiftId || undefined,
          },
        })
      ).data.data,
  });

  const d = data.data;
  const k = d?.kpis;
  const mtbfStatus = k ? mtbfBand(k.mtbf, d?.targets.mtbfMins ?? MTBF_TARGET_MINS) : 'average';
  const mttrStatus = k ? mttrBand(k.mttr, d?.targets.mttrMins ?? MTTR_TARGET_MINS) : 'average';

  const paretoMax = useMemo(
    () => Math.max(1, ...(d?.paretoReasons.map((r) => r.minutes) ?? [1])),
    [d?.paretoReasons],
  );
  const machineBarMax = useMemo(
    () => Math.max(1, ...(d?.byMachine.map((m) => m.breakdownMins) ?? [1])),
    [d?.byMachine],
  );

  const filteredHistory = useMemo(() => {
    if (!d?.breakdownHistory) return [];
    if (!machineId) return d.breakdownHistory;
    const machine = machines.data?.find((m) => m.id === machineId);
    const label = machine?.name || machine?.code || '';
    return d.breakdownHistory.filter(
      (r) => r.machine === label || (machine?.code && r.machine.includes(machine.code)),
    );
  }, [d?.breakdownHistory, machineId, machines.data]);

  function drillToMachine(id: string | null, name: string) {
    if (id) setMachineId(id);
    else {
      const hit = machines.data?.find((m) => m.name === name || m.code === name);
      if (hit) setMachineId(hit.id);
    }
    historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (data.isLoading && !d) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Maintenance Reliability Dashboard"
        subtitle="MTBF, MTTR & breakdown analytics from production downtime entries"
      />

      <FilterBar columnsClassName="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <FilterField label="From">
          <input className={FILTER_CTRL} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FilterField>
        <FilterField label="To">
          <input className={FILTER_CTRL} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </FilterField>
        <FilterField label="Plant">
          <select className={FILTER_CTRL} value={plantId} onChange={(e) => setPlantId(e.target.value)}>
            <option value="">All plants</option>
            {(plants.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Line">
          <select
            className={FILTER_CTRL}
            value={lineId}
            onChange={(e) => {
              setLineId(e.target.value);
              setMachineId('');
            }}
          >
            <option value="">All lines</option>
            {(lines.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.code || l.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Machine">
          <select className={FILTER_CTRL} value={machineId} onChange={(e) => setMachineId(e.target.value)}>
            <option value="">All machines</option>
            {(machines.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.code}
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
      </FilterBar>

      <p className="mb-4 text-xs" style={{ color: 'var(--muted)' }}>
        {d?.dataSource ?? 'Production downtime entries'} · Target MTBF ≥ {d?.targets.mtbfMins ?? MTBF_TARGET_MINS}{' '}
        min · Target MTTR ≤ {d?.targets.mttrMins ?? MTTR_TARGET_MINS} min ·{' '}
        <Link to="/breakdown-entries" className="underline">
          Breakdown entry
        </Link>{' '}
        ·{' '}
        <Link to="/production-entries" className="underline">
          Production entries
        </Link>{' '}
        ·{' '}
        <Link to="/mtbf-mttr-guide" className="underline">
          MTBF/MTTR guide
        </Link>{' '}
        ·{' '}
        <Link to="/downtime-analysis" className="underline">
          Full downtime analysis
        </Link>
      </p>

      {!d || !k ? (
        <div className="panel p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
          Unable to load maintenance reliability data.
        </div>
      ) : k.failures === 0 && k.plannedProductionMins === 0 ? (
        <div className="panel p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
          No work orders or downtime in this period. Create work orders and log downtime from Production Entries.
        </div>
      ) : (
        <>
          {(d.alerts?.length ?? 0) > 0 && (
            <div
              className="mb-4 rounded-lg border px-4 py-3 text-sm"
              style={{ borderColor: 'var(--band-poor)', background: 'color-mix(in srgb, var(--band-poor) 6%, transparent)' }}
            >
              <div className="flex flex-wrap items-center gap-2 font-semibold" style={{ color: 'var(--text)' }}>
                <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: 'var(--band-poor)' }} />
                {d.alerts.length} repeat failure pattern{d.alerts.length === 1 ? '' : 's'} in this period
              </div>
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                Flagged when the same machine + reason occurs 3 or more times between {d.from} and {d.to}.
              </p>
              <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
                {d.alerts.slice(0, 6).map((a, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs"
                    style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}
                  >
                    <span className="font-medium tabular-nums" style={{ color: 'var(--band-poor)' }}>
                      {a.occurrences}×
                    </span>
                    <span className="min-w-0 truncate" title={a.message}>
                      {a.message}
                    </span>
                  </li>
                ))}
              </ul>
              {(d.repeatFailures?.length ?? 0) > 6 ? (
                <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                  See full list in <strong>Repeat Failure Analysis</strong> below.
                </p>
              ) : null}
            </div>
          )}

          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <KpiCard
              label="MTBF"
              value={fmtMins(k.mtbf)}
              hint={`${RELIABILITY_BAND_LABEL[mtbfStatus]} · higher is better · target ${d.targets.mtbfMins} min`}
              tone={reliabilityBandTone(mtbfStatus)}
              icon={ArrowUp}
            />
            <KpiCard
              label="MTTR"
              value={fmtMins(k.mttr)}
              hint={`${RELIABILITY_BAND_LABEL[mttrStatus]} · lower is better · target ${d.targets.mttrMins} min`}
              tone={reliabilityBandTone(mttrStatus)}
              icon={ArrowDown}
            />
            <KpiCard label="Breakdowns" value={k.failures.toLocaleString()} hint="Unplanned failure events" tone="warn" />
            <KpiCard
              label="Breakdown Time"
              value={fmtMins(k.breakdownMins)}
              hint="Total repair / downtime minutes"
              tone="bad"
            />
            <KpiCard
              label="Availability"
              value={fmtPct(k.availability)}
              hint="Operating time ÷ planned production time"
              tone={metricTone('availability', k.availability)}
            />
            <KpiCard
              label="Reliability"
              value={fmtPct(k.reliability)}
              hint="MTBF vs plant target (120 min)"
              tone={metricTone('availability', k.reliability)}
            />
          </div>

          <div className="mb-5 grid gap-4 text-xs sm:grid-cols-3">
            <div className="panel px-4 py-3">
              <span style={{ color: 'var(--muted)' }}>Planned production time</span>
              <div className="text-lg font-semibold tabular-nums">{fmtMins(k.plannedProductionMins)}</div>
            </div>
            <div className="panel px-4 py-3">
              <span style={{ color: 'var(--muted)' }}>Operating time</span>
              <div className="text-lg font-semibold tabular-nums">{fmtMins(k.operatingTime)}</div>
            </div>
            <div className="panel px-4 py-3">
              <span style={{ color: 'var(--muted)' }}>Formula</span>
              <div className="mt-1 leading-snug" style={{ color: 'var(--text)' }}>
                MTBF = Operating ÷ Failures · MTTR = Breakdown time ÷ Failures
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="MTBF Trend (monthly)">
              {d.mtbfTrend.length === 0 ? (
                <div className="flex h-48 items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
                  No trend data
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={d.mtbfTrend} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip formatter={(v) => [fmtMins(Number(v)), 'MTBF']} />
                    <Legend />
                    <Line type="monotone" dataKey="mtbf" name="MTBF (min)" stroke="var(--chart-1)" strokeWidth={2}>
                      <ChartValueLabels />
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="MTTR Trend (monthly)">
              {d.mttrTrend.length === 0 ? (
                <div className="flex h-48 items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
                  No trend data
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={d.mttrTrend} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip formatter={(v) => [fmtMins(Number(v)), 'MTTR']} />
                    <Legend />
                    <Line type="monotone" dataKey="mttr" name="MTTR (min)" stroke="var(--chart-4)" strokeWidth={2}>
                      <ChartValueLabels />
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <ChartCard title="Breakdown by Machine" bodyClassName="h-auto max-h-72 overflow-y-auto">
              {d.byMachine.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
                  No machine breakdowns
                </div>
              ) : (
                <div className="space-y-2 py-2">
                  {d.byMachine.map((m) => (
                    <HorizontalBar key={m.name} label={m.name} value={Math.round(m.breakdownMins)} max={machineBarMax} />
                  ))}
                </div>
              )}
            </ChartCard>

            <ChartCard title="Top 10 Breakdown Reasons (Pareto)" bodyClassName="h-auto max-h-72 overflow-y-auto">
              {d.paretoReasons.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
                  No reason data
                </div>
              ) : (
                <div className="space-y-2 py-2">
                  {d.paretoReasons.map((r) => (
                    <HorizontalBar key={r.name} label={r.name} value={Math.round(r.minutes)} max={paretoMax} />
                  ))}
                </div>
              )}
            </ChartCard>
          </div>

          <ChartCard title="Machine Reliability" className="mt-4" bodyClassName="h-auto">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                    <th className="px-3 py-2">Machine</th>
                    <th className="px-3 py-2 text-right">MTBF</th>
                    <th className="px-3 py-2 text-right">MTTR</th>
                    <th className="px-3 py-2 text-right">Failures</th>
                    <th className="px-3 py-2 text-right">Breakdown min</th>
                    <th className="px-3 py-2 text-right">Availability</th>
                  </tr>
                </thead>
                <tbody>
                  {d.byMachine.map((m) => (
                    <tr
                      key={m.name}
                      className="cursor-pointer border-b transition hover:bg-black/5 dark:hover:bg-white/5"
                      style={{ borderColor: 'var(--border)' }}
                      onClick={() => drillToMachine(m.machineId, m.name)}
                      title="Click to drill down into breakdown history"
                    >
                      <td className="px-3 py-2 font-medium">{m.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMins(m.mtbf)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMins(m.mttr)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.failures}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMins(m.breakdownMins)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtPct(m.availability)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <ChartCard title="Repeat Failure Analysis" bodyClassName="h-auto">
              {d.repeatFailures.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
                  No repeat patterns
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b text-xs uppercase tracking-wide" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                        <th className="px-2 py-2">Machine</th>
                        <th className="px-2 py-2">Failure</th>
                        <th className="px-2 py-2 text-right">×</th>
                        <th className="px-2 py-2 text-right">Total min</th>
                        <th className="px-2 py-2 text-right">MTTR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.repeatFailures.map((r, i) => (
                        <tr key={i} className="border-b" style={{ borderColor: 'var(--border)' }}>
                          <td className="px-2 py-2">{r.machine}</td>
                          <td className="px-2 py-2">
                            {r.reason}
                            {r.alert && (
                              <Badge className="ml-2" tone="bad">
                                Repeat
                              </Badge>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{r.occurrences}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{fmtMins(r.totalMins)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{fmtMins(r.mttr)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Maintenance Performance (by category)" bodyClassName="h-64 overflow-hidden">
              {d.maintenanceMix.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
                  No category mix
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.maintenanceMix} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} angle={-25} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="minutes" name="Minutes" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="count" name="Events" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          <div ref={historyRef} className="relative z-0 mt-4">
            <ChartCard title={machineId ? 'Breakdown History (filtered machine)' : 'Breakdown History'} bodyClassName="h-auto">
              {machineId && (
                <div className="mb-3 flex justify-end">
                  <button type="button" className="text-xs underline" onClick={() => setMachineId('')}>
                    Clear machine filter
                  </button>
                </div>
              )}
              {filteredHistory.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
                  No breakdown records in this period
                </div>
              ) : (
                <div className="max-h-[28rem] overflow-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="sticky top-0 z-10" style={{ background: 'var(--panel)' }}>
                      <tr className="border-b text-xs uppercase tracking-wide" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                        <th className="px-2 py-2">Date</th>
                        <th className="px-2 py-2">WO</th>
                        <th className="px-2 py-2">Line</th>
                        <th className="px-2 py-2">Shift</th>
                        <th className="px-2 py-2">Machine</th>
                        <th className="px-2 py-2">Category</th>
                        <th className="px-2 py-2">Reason</th>
                        <th className="px-2 py-2 text-right">Min</th>
                        <th className="px-2 py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistory.map((r) => (
                        <tr key={r.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                          <td className="px-2 py-2 whitespace-nowrap">{r.date}</td>
                          <td className="px-2 py-2">{r.planNumber}</td>
                          <td className="px-2 py-2">{r.line}</td>
                          <td className="px-2 py-2">{r.shift}</td>
                          <td className="px-2 py-2">{r.machine}</td>
                          <td className="px-2 py-2">{r.category}</td>
                          <td className="px-2 py-2">{r.reason}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{r.durationMins}</td>
                          <td className="max-w-[12rem] truncate px-2 py-2" title={r.actionTaken}>
                            {r.actionTaken || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ChartCard>
          </div>

          <div
            className="panel relative z-10 mt-4 flex items-start gap-3 px-4 py-3 text-sm"
            style={{ color: 'var(--muted)', background: 'var(--panel)' }}
          >
            <Wrench className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <strong style={{ color: 'var(--text)' }}>Improvement loop</strong> — Log breakdowns in Production Entries →
              analyse Pareto &amp; repeat failures here → RCA / corrective action (action taken field) → compare MTBF/MTTR
              before vs after in trend charts.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
