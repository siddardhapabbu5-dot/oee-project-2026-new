import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock3, CircleDashed } from 'lucide-react';
import api, { type ApiResponse } from '../lib/api';
import { Badge, Field, KpiCard, LoadingBlock, PageHeader } from '../components/ui';
import { formatWorkOrder } from '../lib/workOrder';

type StatusFilter = 'ALL' | 'PENDING' | 'PARTIAL' | 'COMPLETED';

type StatusRow = {
  planId: string;
  planNumber: string;
  productionDate: string;
  batchNumber?: string;
  planStatus: string;
  line: { id: string; name: string; code?: string | null };
  shift: { id: string; name: string; code?: string | null };
  product: { id: string; name: string };
  sku: { code?: string; name?: string; packVolume?: string | null; packSize: number };
  actualCases: number;
  stdQuantity: number;
  materialCount: number;
  filledCount: number;
  totalWastageQty: number;
  wastageStatus: 'PENDING' | 'PARTIAL' | 'COMPLETED';
};

type StatusResponse = {
  materialCount: number;
  counts: { all: number; pending: number; partial: number; completed: number };
  rows: StatusRow[];
};

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function formatDate(raw: string) {
  const d = new Date(`${String(raw).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusTone(status: StatusRow['wastageStatus']): 'default' | 'good' | 'warn' | 'bad' {
  if (status === 'COMPLETED') return 'good';
  if (status === 'PARTIAL') return 'warn';
  return 'bad';
}

function statusLabel(status: StatusRow['wastageStatus']) {
  if (status === 'COMPLETED') return 'Completed';
  if (status === 'PARTIAL') return 'Partial';
  return 'Pending';
}

export default function WastageStatusPage() {
  const [from, setFrom] = useState(() => monthStart());
  const [to, setTo] = useState(() => today());
  const [shiftId, setShiftId] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');

  const shifts = useQuery({
    queryKey: ['shifts-wastage-status'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/shifts')).data.data,
  });

  const report = useQuery({
    queryKey: ['wastage-wo-status', from, to, shiftId, status],
    queryFn: async () =>
      (
        await api.get<ApiResponse<StatusResponse>>('/waste-entries/work-order-status', {
          params: {
            from,
            to,
            ...(shiftId ? { shiftId } : {}),
            ...(status !== 'ALL' ? { status } : {}),
          },
        })
      ).data.data,
  });

  const rows = report.data?.rows ?? [];
  const counts = report.data?.counts;

  const pendingLike = useMemo(
    () => (counts ? counts.pending + counts.partial : 0),
    [counts],
  );

  if (report.isLoading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Wastage Status"
        subtitle="Work-order-wise — pending vs completed wastage entry"
        actions={
          <Link to="/waste-entries" className="btn btn-primary">
            Open Wastage Entries
          </Link>
        }
      />

      <div className="panel mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="From Date">
            <input className="input w-full" type="date" value={from} max={today()} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To Date">
            <input className="input w-full" type="date" value={to} max={today()} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Shift">
            <select className="input w-full" value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
              <option value="">All shifts</option>
              {(shifts.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Wastage Status">
            <select className="input w-full" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
              <option value="ALL">All</option>
              <option value="PENDING">Pending</option>
              <option value="PARTIAL">Partial</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </Field>
          <div className="flex items-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => { setFrom(monthStart()); setTo(today()); }}>
              This month
            </button>
          </div>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Work Orders" value={String(counts?.all ?? 0)} icon={CircleDashed} />
        <KpiCard label="Pending" value={String(counts?.pending ?? 0)} icon={Clock3} tone="bad" />
        <KpiCard label="Partial" value={String(counts?.partial ?? 0)} icon={Clock3} tone="warn" />
        <KpiCard label="Completed" value={String(counts?.completed ?? 0)} icon={CheckCircle2} tone="good" />
      </div>

      {report.isError ? (
        <div className="panel p-5 text-sm" style={{ color: 'var(--danger)' }}>
          Could not load wastage status. Restart the API, then try again.
        </div>
      ) : (
        <div className="panel overflow-hidden p-0">
          <div
            className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 text-sm"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="font-semibold">Work orders</div>
            <div style={{ color: 'var(--muted)' }}>
              {pendingLike} still need wastage · {counts?.completed ?? 0} completed
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="wastage-entry-table w-full text-sm">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Work order</th>
                  <th>Line</th>
                  <th>Shift</th>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Cases</th>
                  <th>Materials</th>
                  <th>Wastage qty</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-10 text-center" style={{ color: 'var(--muted)' }}>
                      No work orders for this filter
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const sku = r.sku?.packVolume || r.sku?.name || r.sku?.code || '—';
                    return (
                      <tr key={r.planId}>
                        <td className="whitespace-nowrap">{formatDate(r.productionDate)}</td>
                        <td className="font-mono font-medium whitespace-nowrap">
                          {formatWorkOrder(r.planNumber)}
                        </td>
                        <td className="whitespace-nowrap">{r.line?.code || r.line?.name || '—'}</td>
                        <td className="whitespace-nowrap">{r.shift?.name || '—'}</td>
                        <td>{r.product?.name || '—'}</td>
                        <td className="whitespace-nowrap">{sku}</td>
                        <td className="tabular-nums">{r.actualCases.toLocaleString()}</td>
                        <td className="tabular-nums whitespace-nowrap">
                          {r.filledCount}/{r.materialCount}
                        </td>
                        <td className="tabular-nums">{r.totalWastageQty.toLocaleString()}</td>
                        <td>
                          <Badge tone={statusTone(r.wastageStatus)}>{statusLabel(r.wastageStatus)}</Badge>
                        </td>
                        <td>
                          <Link
                            className="btn btn-secondary"
                            style={{ padding: '0.35rem 0.7rem', fontSize: '0.8rem' }}
                            to={`/waste-entries?date=${r.productionDate}&planId=${r.planId}${
                              r.wastageStatus === 'PENDING' ? '' : '&edit=1'
                            }`}
                          >
                            {r.wastageStatus === 'COMPLETED' || r.wastageStatus === 'PARTIAL'
                              ? 'Edit'
                              : 'Enter'}
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
