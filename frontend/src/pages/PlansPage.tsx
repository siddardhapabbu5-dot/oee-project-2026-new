import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api, { type ApiResponse } from '../lib/api';
import { FilterBar, FilterField, FILTER_CTRL } from '../components/FilterBar';
import { DateWithIcon, Field, IconButton, LoadingBlock, Modal, PageHeader } from '../components/ui';
import { useAuthStore } from '../store';
import { formatWorkOrder } from '../lib/workOrder';

type Plan = {
  id: string;
  planNumber: string;
  productionDate: string;
  plantId: string;
  lineId: string;
  shiftId: string;
  productId: string;
  skuId: string;
  supervisorId?: string | null;
  batchNumber: string;
  plannedCases: number;
  plannedOperatingMins: number;
  plannedManpower: number;
  plannedStartTime: string;
  plannedEndTime: string;
  status: string;
  plant: { name: string };
  line: { name: string; code?: string };
  shift: { name: string };
  product: { name: string };
  sku: { code: string };
  supervisor?: { id?: string; firstName: string; lastName: string } | null;
};

function timeFromIso(value?: string) {
  if (!value) return '06:00';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const m = value.match(/T(\d{2}:\d{2})/);
    return m?.[1] || '06:00';
  }
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Build start/end datetimes; if end ≤ start, treat as overnight (end next day). */
function buildPlanWindow(date: string, startTime: string, endTime: string) {
  const start = new Date(`${date}T${startTime || '06:00'}:00`);
  let end = new Date(`${date}T${endTime || '14:00'}:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }
  return { start, end };
}

function windowOverlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

function fmtHm(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function localToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDisplayDate(iso?: string) {
  if (!iso) return '—';
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function supervisorShort(s?: { firstName: string; lastName: string } | null) {
  if (!s) return '—';
  const last = (s.lastName || '').trim();
  return last ? `${s.firstName} ${last.charAt(0)}.` : s.firstName;
}

export default function PlansPage() {
  const user = useAuthStore((s) => s.user);
  const canEdit = user?.role === 'ADMIN' || user?.role === 'PRODUCTION_MANAGER';
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [filterDate, setFilterDate] = useState(() => localToday());
  const [filterShiftId, setFilterShiftId] = useState('');
  const qc = useQueryClient();

  const plans = useQuery({
    queryKey: ['plans', filterDate, filterShiftId],
    queryFn: async () =>
      (
        await api.get<ApiResponse<Plan[]>>('/plans', {
          params: {
            limit: 200,
            ...(filterDate ? { from: filterDate, to: filterDate } : {}),
            ...(filterShiftId ? { shiftId: filterShiftId } : {}),
          },
        })
      ).data.data,
  });

  const formDayPlans = useQuery({
    queryKey: ['plans-line-day', form.productionDate, form.lineId],
    enabled: open && Boolean(form.productionDate && form.lineId),
    queryFn: async () =>
      (
        await api.get<ApiResponse<Plan[]>>('/plans', {
          params: {
            limit: 200,
            from: form.productionDate,
            to: form.productionDate,
            lineId: form.lineId,
          },
        })
      ).data.data,
    staleTime: 30_000,
  });

  const timingOverlaps = useMemo(() => {
    if (!form.productionDate || !form.lineId || !form.startTime || !form.endTime) return [];
    const window = buildPlanWindow(form.productionDate, form.startTime, form.endTime);
    if (!window) return [];
    const rows = formDayPlans.data ?? [];
    const hits: Array<{ planNumber: string; shiftName: string; start: string; end: string }> = [];
    for (const p of rows) {
      if (editing && p.id === editing.id) continue;
      const oStart = new Date(p.plannedStartTime);
      let oEnd = new Date(p.plannedEndTime);
      if (Number.isNaN(oStart.getTime()) || Number.isNaN(oEnd.getTime())) continue;
      if (oEnd.getTime() <= oStart.getTime()) {
        oEnd = new Date(oEnd.getTime() + 24 * 60 * 60 * 1000);
      }
      if (windowOverlaps(window.start, window.end, oStart, oEnd)) {
        hits.push({
          planNumber: p.planNumber,
          shiftName: p.shift?.name || '—',
          start: fmtHm(oStart),
          end: fmtHm(oEnd),
        });
      }
    }
    return hits;
  }, [
    form.productionDate,
    form.lineId,
    form.startTime,
    form.endTime,
    formDayPlans.data,
    editing,
  ]);

  const sortedPlans = useMemo(() => {
    const rows = plans.data ?? [];
    return [...rows].sort((a, b) => {
      const byShift = String(a.shift?.name || '').localeCompare(String(b.shift?.name || ''), undefined, {
        sensitivity: 'base',
      });
      if (byShift !== 0) return byShift;
      const byPlan = String(a.planNumber).localeCompare(String(b.planNumber), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      if (byPlan !== 0) return byPlan;
      return new Date(a.plannedStartTime).getTime() - new Date(b.plannedStartTime).getTime();
    });
  }, [plans.data]);

  const showDateCol = !filterDate;
  const plants = useQuery({ queryKey: ['plants'], queryFn: async () => (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/plants', { params: { limit: 100 } })).data.data });
  const lines = useQuery({ queryKey: ['lines'], queryFn: async () => (await api.get<ApiResponse<Array<{ id: string; code: string; name: string; plantId: string }>>>('/lines', { params: { limit: 100 } })).data.data });
  const shifts = useQuery({ queryKey: ['shifts'], queryFn: async () => (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/shifts')).data.data });
  const products = useQuery({
    queryKey: ['product-options'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/products/options')).data.data,
    staleTime: 300_000,
  });
  const supervisors = useQuery({
    queryKey: ['supervisors'],
    queryFn: async () =>
      (
        await api.get<ApiResponse<Array<{ id: string; firstName: string; lastName: string; email: string }>>>('/supervisors')
      ).data.data,
  });
  const skus = useQuery({
    queryKey: ['skus'],
    queryFn: async () =>
      (
        await api.get<
          ApiResponse<Array<{ id: string; code: string; name: string; productId: string; packVolume?: string | null }>>
        >('/skus', { params: { limit: 200 } })
      ).data.data,
  });

  const PACK_VOLUME_ORDER = ['200 ML', '250 ML', '300 ML', '500 ML', '750 ML', '1000 ML', '2000 ML', 'Jar-20L'];

  const filteredLines = useMemo(() => (lines.data ?? []).filter((l) => !form.plantId || l.plantId === form.plantId), [lines.data, form.plantId]);

  const planSkus = useMemo(() => {
    const all = skus.data ?? [];
    const catalogCode: Record<string, string> = {
      '200 ML': 'SKU-200-ML',
      '250 ML': 'SKU-250-ML',
      '300 ML': 'SKU-300-ML',
      '500 ML': 'SKU-500-ML',
      '750 ML': 'SKU-750-ML',
      '1000 ML': 'SKU-1000-ML',
      '2000 ML': 'SKU-2000-ML',
      'Jar-20L': 'SKU-JAR-20L',
    };
    return PACK_VOLUME_ORDER.map((label) => {
      const code = catalogCode[label];
      const found =
        all.find((s) => s.code === code) ||
        all.find((s) => (s.packVolume || '').toUpperCase() === label.toUpperCase()) ||
        all.find((s) => (s.name || '').toUpperCase() === label.toUpperCase());
      return found ? { id: found.id, label } : null;
    }).filter(Boolean) as Array<{ id: string; label: string }>;
  }, [skus.data]);

  const skuLabelByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of skus.data ?? []) {
      map.set(s.code, s.packVolume || s.name || s.code);
    }
    for (const s of planSkus) {
      const row = (skus.data ?? []).find((x) => x.id === s.id);
      if (row) map.set(row.code, s.label);
    }
    return map;
  }, [planSkus, skus.data]);

  function openCreate() {
    const today = localToday();
    setEditing(null);
    setForm({
      productionDate: today,
      plannedOperatingMins: '480',
      plannedManpower: '12',
      startTime: '06:00',
      endTime: '14:00',
      allowOverlap: 'false',
    });
    setOpen(true);
  }

  function openEdit(p: Plan) {
    setEditing(p);
    setForm({
      productionDate: p.productionDate.slice(0, 10),
      plantId: p.plantId,
      lineId: p.lineId,
      shiftId: p.shiftId,
      productId: p.productId,
      skuId: p.skuId,
      batchNumber: p.batchNumber,
      plannedCases: String(p.plannedCases ?? ''),
      plannedOperatingMins: String(p.plannedOperatingMins ?? ''),
      plannedManpower: String(p.plannedManpower ?? ''),
      startTime: timeFromIso(p.plannedStartTime),
      endTime: timeFromIso(p.plannedEndTime),
      status: p.status,
      supervisorId: p.supervisorId || p.supervisor?.id || '',
      allowOverlap: 'false',
    });
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditing(null);
    setForm({});
  }

  const save = useMutation({
    mutationFn: async () => {
      const window = buildPlanWindow(
        form.productionDate,
        form.startTime || '06:00',
        form.endTime || '14:00',
      );
      if (!window) throw new Error('Invalid production start or end time');

      if (timingOverlaps.length > 0 && form.allowOverlap !== 'true') {
        throw new Error(
          `Times overlap with ${formatWorkOrder(timingOverlaps[0].planNumber)} (${timingOverlaps[0].start}–${timingOverlaps[0].end}). Adjust times or check Allow overlap.`,
        );
      }

      const payload = {
        productionDate: form.productionDate,
        plantId: form.plantId,
        lineId: form.lineId,
        shiftId: form.shiftId,
        productId: form.productId,
        skuId: form.skuId,
        batchNumber: form.batchNumber,
        plannedCases: Number(form.plannedCases),
        plannedOperatingMins: Number(form.plannedOperatingMins || 480),
        plannedStartTime: window.start.toISOString(),
        plannedEndTime: window.end.toISOString(),
        plannedManpower: Number(form.plannedManpower || 10),
        supervisorId: form.supervisorId || null,
        allowOverlap: form.allowOverlap === 'true',
        ...(form.status ? { status: form.status } : {}),
      };
      if (editing) return api.patch(`/plans/${editing.id}`, payload);
      return api.post('/plans', payload);
    },
    onSuccess: async () => {
      toast.success(editing ? 'Work order updated' : 'Work order created');
      closeModal();
      await qc.invalidateQueries({ queryKey: ['plans'] });
    },
    onError: (err: unknown) => {
      toast.error((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed');
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/plans/${id}`),
    onSuccess: async () => {
      toast.success('Work order deleted');
      await qc.invalidateQueries({ queryKey: ['plans'] });
    },
  });

  async function downloadExcel() {
    try {
      const res = await api.get('/plans/export/excel', {
        responseType: 'blob',
        params: filterDate ? { from: filterDate, to: filterDate } : {},
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `production-plans-${filterDate || localToday()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel downloaded');
    } catch {
      toast.error('Excel download failed');
    }
  }

  if (plans.isLoading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Work Order Planning"
        subtitle="Schedule plant/line/shift work orders with SKU and manpower"
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => void downloadExcel()}>
              <FileSpreadsheet size={16} strokeWidth={1.75} />
              Download Excel
            </button>
            {canEdit ? (
              <button className="btn btn-primary" onClick={openCreate}>
                <Plus size={16} strokeWidth={2} />
                New Work Order
              </button>
            ) : null}
          </>
        }
      />

      <FilterBar columnsClassName="sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_minmax(12rem,1.4fr)]">
        <FilterField label="Production Date">
          <input
            className={FILTER_CTRL}
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
        </FilterField>
        <FilterField label="Shift">
          <select className={FILTER_CTRL} value={filterShiftId} onChange={(e) => setFilterShiftId(e.target.value)}>
            <option value="">All shifts</option>
            {(shifts.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Today">
          <button
            type="button"
            className={`${FILTER_CTRL} cursor-pointer px-3 font-medium ${
              filterDate === localToday() ? 'btn btn-primary border-transparent' : ''
            }`}
            onClick={() => setFilterDate(localToday())}
          >
            Today
          </button>
        </FilterField>
        <FilterField label="All Days">
          <button
            type="button"
            className={`${FILTER_CTRL} cursor-pointer px-3 font-medium ${
              !filterDate ? 'btn btn-primary border-transparent' : ''
            }`}
            onClick={() => setFilterDate('')}
          >
            All Days
          </button>
        </FilterField>
        <FilterField label="Status">
          <div className={`${FILTER_CTRL} flex items-center text-sm`} style={{ color: 'var(--muted)' }}>
            {filterDate ? (
              <>
                Showing <strong className="mx-1" style={{ color: 'var(--text)' }}>{sortedPlans.length}</strong>
                work order{sortedPlans.length === 1 ? '' : 's'} for{' '}
                <strong className="ml-1" style={{ color: 'var(--text)' }}>{fmtDisplayDate(filterDate)}</strong>
                {filterShiftId
                  ? ` · ${(shifts.data ?? []).find((s) => s.id === filterShiftId)?.name || 'shift'}`
                  : ''}
              </>
            ) : (
              <>
                Showing <strong className="mx-1" style={{ color: 'var(--text)' }}>{sortedPlans.length}</strong>
                work order{sortedPlans.length === 1 ? '' : 's'} (all days
                {filterShiftId
                  ? ` · ${(shifts.data ?? []).find((s) => s.id === filterShiftId)?.name || 'shift'}`
                  : ''}
                )
              </>
            )}
          </div>
        </FilterField>
      </FilterBar>

      <div className="table-wrap fit-cols panel">
        <table className="data entry-log">
          <colgroup>
            <col style={{ width: showDateCol ? '9%' : '10%' }} />
            {showDateCol ? <col style={{ width: '8%' }} /> : null}
            <col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '5%' }} />
            <col style={{ width: '5%' }} />
            <col style={{ width: showDateCol ? '9%' : '11%' }} />
            {canEdit ? <col style={{ width: '5.5%' }} /> : null}
          </colgroup>
          <thead>
            <tr>
              <th>Work Order</th>
              {showDateCol ? <th>Date</th> : null}
              <th>Line</th>
              <th>Shift</th>
              <th className="col-time" title="Planned start – end">
                Time
              </th>
              <th>Product</th>
              <th>SKU</th>
              <th>Batch</th>
              <th title="Planned cases">Cases</th>
              <th title="Operating minutes">Mins</th>
              <th title="Manpower">Man</th>
              <th>Supervisor</th>
              {canEdit ? <th className="col-actions">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {sortedPlans.length === 0 ? (
              <tr>
                <td
                  colSpan={(showDateCol ? 1 : 0) + 11 + (canEdit ? 1 : 0)}
                  className="py-8 text-center"
                  style={{ color: 'var(--muted)', whiteSpace: 'normal', overflow: 'visible' }}
                >
                  {filterDate ? `No work orders for ${fmtDisplayDate(filterDate)}` : 'No work orders found'}
                </td>
              </tr>
            ) : (
              sortedPlans.map((p) => {
                const start = timeFromIso(p.plannedStartTime);
                const end = timeFromIso(p.plannedEndTime);
                const supervisorFull = p.supervisor
                  ? `${p.supervisor.firstName} ${p.supervisor.lastName}`
                  : '';
                return (
                  <tr key={p.id}>
                    <td className="font-mono font-medium" title={formatWorkOrder(p.planNumber)}>
                      {formatWorkOrder(p.planNumber)}
                    </td>
                    {showDateCol ? (
                      <td>
                        <DateWithIcon value={p.productionDate} />
                      </td>
                    ) : null}
                    <td title={p.line.name}>{p.line.code || p.line.name}</td>
                    <td>{p.shift.name}</td>
                    <td className="col-time" title={`${start} – ${end}`}>
                      {start}–{end}
                    </td>
                    <td title={p.product.name}>{p.product.name}</td>
                    <td>{skuLabelByCode.get(p.sku.code) || p.sku.code}</td>
                    <td title={p.batchNumber}>{p.batchNumber}</td>
                    <td className="tabular-nums">{p.plannedCases.toLocaleString()}</td>
                    <td className="tabular-nums">
                      {p.plannedOperatingMins != null ? p.plannedOperatingMins.toLocaleString() : '—'}
                    </td>
                    <td className="tabular-nums">{p.plannedManpower ?? '—'}</td>
                    <td title={supervisorFull}>{supervisorShort(p.supervisor)}</td>
                    {canEdit ? (
                      <td className="col-actions">
                        <div className="row-actions">
                          <IconButton title="Edit" primary onClick={() => openEdit(p)}>
                            <Pencil size={15} strokeWidth={1.75} />
                          </IconButton>
                          <IconButton
                            title="Delete"
                            danger
                            onClick={() => {
                              if (window.confirm('Delete this work order?')) remove.mutate(p.id);
                            }}
                          >
                            <Trash2 size={15} strokeWidth={1.75} />
                          </IconButton>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} title={editing ? `Edit Work Order ${formatWorkOrder(editing.planNumber)}` : 'Create Work Order'} onClose={closeModal}>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Production Date">
            <input className="input" type="date" value={form.productionDate || ''} onChange={(e) => setForm({ ...form, productionDate: e.target.value })} />
          </Field>
          <Field label="Batch Number">
            <input className="input" value={form.batchNumber || ''} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} />
          </Field>
          <Field label="Plant">
            <select className="input" value={form.plantId || ''} onChange={(e) => setForm({ ...form, plantId: e.target.value, lineId: '' })}>
              <option value="">Select...</option>
              {(plants.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Line">
            <select className="input" value={form.lineId || ''} onChange={(e) => setForm({ ...form, lineId: e.target.value })}>
              <option value="">Select...</option>
              {filteredLines.map((l) => (
                <option key={l.id} value={l.id}>{l.code || l.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Shift">
            <select className="input" value={form.shiftId || ''} onChange={(e) => setForm({ ...form, shiftId: e.target.value })}>
              <option value="">Select...</option>
              {(shifts.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Product">
            <select className="input" value={form.productId || ''} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
              <option value="">Select...</option>
              {(products.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="SKU">
            <select className="input" value={form.skuId || ''} onChange={(e) => setForm({ ...form, skuId: e.target.value })}>
              <option value="">Select...</option>
              {planSkus.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Supervisor">
            <select className="input" value={form.supervisorId || ''} onChange={(e) => setForm({ ...form, supervisorId: e.target.value })}>
              <option value="">Select supervisor...</option>
              {(supervisors.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.firstName} {s.lastName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Planned Cases">
            <input
              className="input"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              placeholder="e.g. 1000"
              value={form.plannedCases ?? ''}
              onChange={(e) => setForm({ ...form, plannedCases: e.target.value })}
            />
          </Field>
          <Field label="Operating Mins">
            <input
              className="input"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              placeholder="e.g. 480"
              value={form.plannedOperatingMins ?? ''}
              onChange={(e) => setForm({ ...form, plannedOperatingMins: e.target.value })}
            />
          </Field>
          <Field label="Manpower">
            <input
              className="input"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              placeholder="e.g. 12"
              value={form.plannedManpower ?? ''}
              onChange={(e) => setForm({ ...form, plannedManpower: e.target.value })}
            />
          </Field>
          <Field label="Start Time">
            <input
              className="input"
              type="time"
              value={form.startTime ?? '06:00'}
              onChange={(e) => setForm({ ...form, startTime: e.target.value, allowOverlap: 'false' })}
            />
          </Field>
          <Field label="End Time">
            <input className="input" type="time" value={form.endTime ?? '14:00'} onChange={(e) => setForm({ ...form, endTime: e.target.value, allowOverlap: 'false' })} />
          </Field>
        </div>

        {form.productionDate && form.lineId && form.startTime && form.endTime ? (
          <div className="mt-3 space-y-2">
            {timingOverlaps.length > 0 ? (
              <div
                className="rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 12%, transparent)' }}
              >
                <p className="font-medium" style={{ color: 'var(--text)' }}>
                  Time overlap on this line
                </p>
                <ul className="mt-1 list-inside list-disc text-xs" style={{ color: 'var(--muted)' }}>
                  {timingOverlaps.map((o) => (
                    <li key={`${o.planNumber}-${o.start}`}>
                      {formatWorkOrder(o.planNumber)} · {o.shiftName} · {o.start}–{o.end}
                    </li>
                  ))}
                </ul>
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.allowOverlap === 'true'}
                    onChange={(e) => setForm({ ...form, allowOverlap: e.target.checked ? 'true' : 'false' })}
                  />
                  Allow overlap (save anyway)
                </label>
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                No time overlap with other work orders on this line for {form.productionDate}.
              </p>
            )}
          </div>
        ) : null}

        <button
          className="btn btn-primary mt-3 w-full"
          onClick={() => save.mutate()}
          disabled={save.isPending || (timingOverlaps.length > 0 && form.allowOverlap !== 'true')}
        >
          {save.isPending ? 'Saving...' : editing ? 'Update Plan' : 'Save Plan'}
        </button>
      </Modal>
    </div>
  );
}
