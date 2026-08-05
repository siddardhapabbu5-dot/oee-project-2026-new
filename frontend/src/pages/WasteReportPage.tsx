import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { PackageX, Plus, Recycle, TriangleAlert } from 'lucide-react';
import api, { type ApiResponse } from '../lib/api';
import { ChartCard, Field, KpiCard, LoadingBlock, PageHeader } from '../components/ui';

type WasteReport = {
  from: string;
  to: string;
  kpis: {
    totalEntries: number;
    totalQuantity: number;
    materialCount: number;
    topMaterial: string;
    topReason: string;
  };
  byMaterial: Array<{ name: string; code: string; unit: string; quantity: number; count: number }>;
  byReason: Array<{ reason: string; quantity: number; count: number }>;
  dailyTrend: Array<{ date: string; quantity: number }>;
  byShift: Array<{ shift: string; quantity: number }>;
  recent: Array<{
    id: string;
    wasteDate: string;
    quantity: number;
    unit: string;
    reason: string;
    material: { name: string };
    shift?: { name: string } | null;
    line?: { code?: string; name: string } | null;
  }>;
};

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function fmtAxisDate(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export default function WasteReportPage() {
  const [from, setFrom] = useState(() => monthStart());
  const [to, setTo] = useState(() => today());
  const [shiftId, setShiftId] = useState('');
  const [materialId, setMaterialId] = useState('');

  const materials = useQuery({
    queryKey: ['waste-materials'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/waste-materials')).data.data,
  });
  const shifts = useQuery({
    queryKey: ['shifts-waste-report'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/shifts')).data.data,
  });

  const report = useQuery({
    queryKey: ['waste-report', from, to, shiftId, materialId],
    queryFn: async () =>
      (
        await api.get<ApiResponse<WasteReport>>('/dashboard/waste-report', {
          params: {
            from,
            to,
            ...(shiftId ? { shiftId } : {}),
            ...(materialId ? { materialId } : {}),
          },
        })
      ).data.data,
  });

  const daily = useMemo(
    () => (report.data?.dailyTrend ?? []).map((r) => ({ ...r, label: fmtAxisDate(r.date) })),
    [report.data?.dailyTrend],
  );

  if (report.isLoading) return <LoadingBlock />;
  if (report.isError || !report.data) {
    return (
      <div>
        <PageHeader title="Waste Report" subtitle="Raw material waste by Preform, Bottles, Cap, Stickers, Shrink Film" />
        <div className="panel p-6 text-sm" style={{ color: 'var(--danger)' }}>
          Could not load waste report. Restart the API after the latest schema update, then try again.
        </div>
      </div>
    );
  }

  const k = report.data.kpis;

  return (
    <div>
      <PageHeader
        title="Waste Report"
        subtitle="Raw material waste — Preform, Bottles, Cap, Stickers & Shrink Film"
        actions={
          <Link to="/waste-entries" className="btn btn-primary">
            <Plus size={16} strokeWidth={2} />
            Add waste entry
          </Link>
        }
      />

      <div className="panel mb-4 flex flex-wrap items-end gap-3 p-4">
        <Field label="From Date">
          <input className="input" type="date" value={from} max={today()} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To Date">
          <input className="input" type="date" value={to} max={today()} onChange={(e) => setTo(e.target.value)} />
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
        <Field label="Material">
          <select className="input min-w-[10rem]" value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
            <option value="">All materials</option>
            {(materials.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Waste Qty" value={k.totalQuantity.toLocaleString()} icon={PackageX} tone="warn" />
        <KpiCard label="Entries" value={k.totalEntries.toLocaleString()} icon={Recycle} />
        <KpiCard label="Top Material" value={k.topMaterial} icon={TriangleAlert} tone="bad" />
        <KpiCard label="Top Reason" value={k.topReason} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Waste by Material">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={report.data.byMaterial}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="quantity" name="Quantity" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Waste by Reason">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={report.data.byReason}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="reason" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="quantity" name="Quantity" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Daily Waste Trend">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="quantity" name="Waste qty" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Waste by Shift">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={report.data.byShift}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="shift" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="quantity" name="Quantity" fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="panel overflow-hidden">
        <div className="border-b px-4 py-3 text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>
          Recent entries
        </div>
        <div className="table-wrap fit-cols">
          <table className="data entry-log">
            <thead>
              <tr>
                <th>Date</th>
                <th>Material</th>
                <th>Qty</th>
                <th>Reason</th>
                <th>Shift</th>
                <th>Line</th>
              </tr>
            </thead>
            <tbody>
              {report.data.recent.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center" style={{ color: 'var(--muted)' }}>
                    No waste logged yet — add entries from Waste Entries.
                  </td>
                </tr>
              ) : (
                report.data.recent.map((r) => (
                  <tr key={r.id}>
                    <td>{String(r.wasteDate).slice(0, 10)}</td>
                    <td>{r.material.name}</td>
                    <td className="tabular-nums">
                      {r.quantity} {r.unit}
                    </td>
                    <td>{r.reason}</td>
                    <td>{r.shift?.name || '—'}</td>
                    <td>{r.line?.code || r.line?.name || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
