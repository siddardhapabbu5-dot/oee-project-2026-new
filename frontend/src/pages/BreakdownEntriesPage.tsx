import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { type ApiResponse } from '../lib/api';
import { FilterBar, FilterField, FILTER_CTRL } from '../components/FilterBar';
import { Field, IconButton, KpiCard, LoadingBlock, PageHeader, Badge } from '../components/ui';
import { formatWorkOrder } from '../lib/workOrder';
import { MaintenanceQuickLinks } from '../components/MaintenanceQuickLinks';

type BreakdownRow = {
  id: string;
  planId: string;
  machineId?: string | null;
  categoryId: string;
  startTime: string;
  endTime: string;
  durationMins: number;
  failureMode?: string | null;
  maintenanceType?: 'CORRECTIVE' | 'PREVENTIVE' | 'BREAKDOWN' | 'EMERGENCY' | null;
  technician?: string | null;
  actionTaken?: string | null;
  rootCause?: string | null;
  sparePartsUsed?: string | null;
  status: 'LOGGED' | 'RCA' | 'CORRECTIVE_ACTION' | 'VERIFIED' | 'CLOSED';
  remarks?: string | null;
  machine?: { id: string; name: string; code?: string } | null;
  category?: { id: string; name: string; code?: string } | null;
  reason?: { id: string; name: string } | null;
  plan?: {
    id: string;
    planNumber: string;
    productionDate: string;
    plant?: { id: string; name: string } | null;
    line?: { id: string; code?: string; name: string } | null;
    shift?: { id: string; name: string } | null;
  } | null;
};

const MAINTENANCE_TYPES = [
  { value: 'BREAKDOWN', label: 'Breakdown' },
  { value: 'CORRECTIVE', label: 'Corrective' },
  { value: 'PREVENTIVE', label: 'Preventive' },
  { value: 'EMERGENCY', label: 'Emergency' },
] as const;

const STATUS_OPTIONS = [
  { value: 'LOGGED', label: 'Logged' },
  { value: 'RCA', label: 'RCA / 5 Why' },
  { value: 'CORRECTIVE_ACTION', label: 'Corrective Action' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'CLOSED', label: 'Closed' },
] as const;

const FAILURE_MODES = [
  'Gearbox issue',
  'Sensor failure',
  'Bottle jam',
  'Conveyor issue',
  'Electrical fault',
  'Pneumatic problem',
  'Cap feeder problem',
  'Label sensor problem',
  'Motor failure',
  'Utility failure',
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function formatTime24(value: string | Date | null | undefined) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function combineDateAndTime(dateStr: string, timeStr: string) {
  const day = dateStr.slice(0, 10);
  const time = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  return new Date(`${day}T${time}`);
}

function minsBetweenTimes(dateStr: string, start?: string, end?: string) {
  if (!start || !end || !dateStr) return 0;
  const a = combineDateAndTime(dateStr, start).getTime();
  let b = combineDateAndTime(dateStr, end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  if (b <= a) b += 24 * 60 * 60 * 1000;
  return Math.round((b - a) / 60000);
}

function localYmd(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthStartLocal() {
  const d = new Date();
  return localYmd(new Date(d.getFullYear(), d.getMonth(), 1));
}

function statusLabel(s: string) {
  return STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;
}

function statusTone(s: string): 'default' | 'good' | 'warn' | 'bad' {
  if (s === 'CLOSED' || s === 'VERIFIED') return 'good';
  if (s === 'RCA' || s === 'CORRECTIVE_ACTION') return 'warn';
  if (s === 'LOGGED') return 'bad';
  return 'default';
}

const emptyForm = (): Record<string, string> => ({
  planId: '',
  machineId: '',
  categoryId: '',
  reason: '',
  startTime: '',
  endTime: '',
  failureMode: '',
  maintenanceType: 'BREAKDOWN',
  technician: '',
  actionTaken: '',
  rootCause: '',
  sparePartsUsed: '',
  status: 'LOGGED',
  remarks: '',
});

export default function BreakdownEntriesPage() {
  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterFrom, setFilterFrom] = useState(() => monthStartLocal());
  const [filterTo, setFilterTo] = useState(() => localYmd());
  const [filterPlantId, setFilterPlantId] = useState('');
  const [filterLineId, setFilterLineId] = useState('');
  const [filterShiftId, setFilterShiftId] = useState('');
  const [filterMachineId, setFilterMachineId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [formShiftId, setFormShiftId] = useState('');
  const qc = useQueryClient();
  const rangeValid = Boolean(filterFrom && filterTo && filterFrom <= filterTo);

  const list = useQuery({
    queryKey: [
      'breakdown-entries',
      filterFrom,
      filterTo,
      filterPlantId,
      filterLineId,
      filterShiftId,
      filterMachineId,
      filterStatus,
    ],
    enabled: rangeValid,
    queryFn: async () =>
      (
        await api.get<ApiResponse<BreakdownRow[]>>('/downtime-entries', {
          params: {
            from: filterFrom,
            to: filterTo,
            ...(filterPlantId ? { plantId: filterPlantId } : {}),
            ...(filterLineId ? { lineId: filterLineId } : {}),
            ...(filterShiftId ? { shiftId: filterShiftId } : {}),
            ...(filterMachineId ? { machineId: filterMachineId } : {}),
            ...(filterStatus ? { status: filterStatus } : {}),
          },
        })
      ).data.data,
    placeholderData: keepPreviousData,
  });

  const plants = useQuery({
    queryKey: ['plants-bd'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/plants', { params: { limit: 50 } })).data.data,
    staleTime: 300_000,
  });

  const lines = useQuery({
    queryKey: ['lines-bd', filterPlantId],
    queryFn: async () =>
      (
        await api.get<ApiResponse<Array<{ id: string; code: string; name: string }>>>('/lines', {
          params: { limit: 100, plantId: filterPlantId || undefined },
        })
      ).data.data,
    staleTime: 300_000,
  });

  const shifts = useQuery({
    queryKey: ['shifts-bd'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/shifts')).data.data,
    staleTime: 300_000,
  });

  const machines = useQuery({
    queryKey: ['machines-bd', filterLineId, form.planId],
    queryFn: async () => {
      const lineId =
        filterLineId ||
        list.data?.find((r) => r.planId === form.planId)?.plan?.line?.id ||
        '';
      return (
        await api.get<ApiResponse<Array<{ id: string; name: string; code: string }>>>('/machines', {
          params: { limit: 200, ...(lineId ? { lineId } : {}) },
        })
      ).data.data;
    },
    staleTime: 300_000,
  });

  const categories = useQuery({
    queryKey: ['dt-cats-bd'],
    queryFn: async () =>
      (
        await api.get<
          ApiResponse<Array<{ id: string; name: string; code: string; reasons: Array<{ id: string; name: string }> }>>
        >('/downtime-categories')
      ).data.data,
    staleTime: 300_000,
  });

  const breakdownCategories = useMemo(() => {
    const all = categories.data ?? [];
    const filtered = all.filter((c) => {
      const code = (c.code || '').toUpperCase();
      const name = (c.name || '').toLowerCase();
      if (code === 'PL' || name === 'planned') return false;
      if (code === 'PR' || name === 'process') return false;
      if (code === 'QL' || name === 'quality') return false;
      return code.includes('MECH') || code.includes('ELEC') || code === 'BD' || name.includes('breakdown');
    });
    if (filtered.length > 0) return filtered;
    return all.filter((c) => {
      const code = (c.code || '').toUpperCase();
      const name = (c.name || '').toLowerCase();
      return code !== 'PL' && code !== 'PR' && code !== 'QL' && name !== 'planned' && name !== 'process' && name !== 'quality';
    });
  }, [categories.data]);

  const reasonSuggestions = useMemo(() => {
    const cat = (categories.data ?? []).find((c) => c.id === form.categoryId);
    return cat?.reasons ?? [];
  }, [categories.data, form.categoryId]);

  useEffect(() => {
    if (formShiftId || !shifts.data?.length) return;
    setFormShiftId(shifts.data[0].id);
  }, [shifts.data, formShiftId]);

  const formPlans = useQuery({
    queryKey: ['plans-bd-form', filterFrom, filterTo, formShiftId, filterLineId],
    enabled: rangeValid && Boolean(formShiftId),
    queryFn: async () =>
      (
        await api.get<
          ApiResponse<
            Array<{
              id: string;
              planNumber: string;
              productionDate: string;
              line?: { code?: string; name: string };
              shift?: { name: string };
              plant?: { name: string };
            }>
          >
        >('/plans', {
          params: {
            limit: 100,
            from: filterFrom,
            to: filterTo,
            shiftId: formShiftId,
            ...(filterLineId ? { lineId: filterLineId } : {}),
          },
        })
      ).data.data,
  });

  const selectedPlan = useMemo(
    () => (formPlans.data ?? []).find((p) => p.id === form.planId) ?? null,
    [formPlans.data, form.planId],
  );

  const productionDate = selectedPlan?.productionDate?.slice(0, 10) ?? filterTo;

  const durationMins = useMemo(
    () => minsBetweenTimes(productionDate, form.startTime, form.endTime),
    [productionDate, form.startTime, form.endTime],
  );

  const summary = useMemo(() => {
    const rows = list.data ?? [];
    let totalMins = 0;
    let openCount = 0;
    const machines = new Set<string>();
    for (const r of rows) {
      totalMins += Number(r.durationMins) || 0;
      if (r.status !== 'CLOSED' && r.status !== 'VERIFIED') openCount += 1;
      if (r.machine?.name) machines.add(r.machine.name);
    }
    return { count: rows.length, totalMins, openCount, machineCount: machines.size };
  }, [list.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.planId) throw new Error('Select work order');
      if (!form.categoryId) throw new Error('Select breakdown category');
      if (!form.reason?.trim()) throw new Error('Enter breakdown reason');
      if (!form.startTime || !form.endTime) throw new Error('Enter start and end time');

      const startTime = combineDateAndTime(productionDate, form.startTime);
      let endTime = combineDateAndTime(productionDate, form.endTime);
      if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) throw new Error('Invalid times');
      if (endTime <= startTime) endTime = new Date(endTime.getTime() + 24 * 60 * 60 * 1000);

      const payload = {
        planId: form.planId,
        machineId: form.machineId || null,
        categoryId: form.categoryId,
        reason: form.reason.trim(),
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        failureMode: form.failureMode || null,
        maintenanceType: (form.maintenanceType || 'BREAKDOWN') as BreakdownRow['maintenanceType'],
        technician: form.technician || null,
        actionTaken: form.actionTaken || null,
        rootCause: form.rootCause || null,
        sparePartsUsed: form.sparePartsUsed || null,
        status: (form.status || 'LOGGED') as BreakdownRow['status'],
        remarks: form.remarks || null,
      };

      if (editingId) return api.patch(`/downtime-entries/${editingId}`, payload);
      return api.post('/downtime-entries', payload);
    },
    onSuccess: async () => {
      toast.success(editingId ? 'Breakdown updated' : 'Breakdown saved');
      setEditingId(null);
      setForm(emptyForm());
      await qc.invalidateQueries({ queryKey: ['breakdown-entries'] });
      await qc.invalidateQueries({ queryKey: ['maintenance-reliability'] });
    },
    onError: (e: unknown) => {
      const apiMsg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(apiMsg || (e instanceof Error ? e.message : 'Save failed'));
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/downtime-entries/${id}`),
    onSuccess: async () => {
      toast.success('Breakdown deleted');
      if (editingId) {
        setEditingId(null);
        setForm(emptyForm());
      }
      await qc.invalidateQueries({ queryKey: ['breakdown-entries'] });
    },
    onError: () => toast.error('Delete failed'),
  });

  function startEdit(row: BreakdownRow) {
    const date = row.plan?.productionDate?.slice(0, 10) ?? row.startTime.slice(0, 10);
    setEditingId(row.id);
    setForm({
      planId: row.planId,
      machineId: row.machineId || '',
      categoryId: row.categoryId,
      reason: row.reason?.name || '',
      startTime: formatTime24(row.startTime),
      endTime: formatTime24(row.endTime),
      failureMode: row.failureMode || '',
      maintenanceType: row.maintenanceType || 'BREAKDOWN',
      technician: row.technician || '',
      actionTaken: row.actionTaken || '',
      rootCause: row.rootCause || '',
      sparePartsUsed: row.sparePartsUsed || '',
      status: row.status || 'LOGGED',
      remarks: row.remarks || '',
      _date: date,
    });
    if (row.plan?.shift?.name && shifts.data) {
      const hit = shifts.data.find((s) => s.name === row.plan?.shift?.name);
      if (hit) setFormShiftId(hit.id);
    }
  }

  if (list.isLoading && !list.data) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Breakdown Entry"
        subtitle="TPM breakdown log — feeds MTBF, MTTR & reliability dashboards"
      />

      <MaintenanceQuickLinks className="mb-4" />

      <FilterBar columnsClassName="sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <FilterField label="From">
          <input className={FILTER_CTRL} type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
        </FilterField>
        <FilterField label="To">
          <input className={FILTER_CTRL} type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
        </FilterField>
        <FilterField label="Plant">
          <select className={FILTER_CTRL} value={filterPlantId} onChange={(e) => setFilterPlantId(e.target.value)}>
            <option value="">All</option>
            {(plants.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Line">
          <select className={FILTER_CTRL} value={filterLineId} onChange={(e) => setFilterLineId(e.target.value)}>
            <option value="">All</option>
            {(lines.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>{l.code || l.name}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Shift">
          <select className={FILTER_CTRL} value={filterShiftId} onChange={(e) => setFilterShiftId(e.target.value)}>
            <option value="">All</option>
            {(shifts.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Machine">
          <select className={FILTER_CTRL} value={filterMachineId} onChange={(e) => setFilterMachineId(e.target.value)}>
            <option value="">All</option>
            {(machines.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>{m.name || m.code}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Status">
          <select className={FILTER_CTRL} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </FilterField>
      </FilterBar>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Breakdowns" value={summary.count} />
        <KpiCard label="Total downtime" value={`${summary.totalMins} min`} tone="bad" />
        <KpiCard label="Open actions" value={summary.openCount} tone="warn" />
        <KpiCard label="Machines affected" value={summary.machineCount} tone="info" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="panel p-4">
          <h3 className="mb-3 font-semibold">{editingId ? 'Edit Breakdown' : 'New Breakdown Entry'}</h3>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Shift (for work order)">
              <select className="input" value={formShiftId} onChange={(e) => setFormShiftId(e.target.value)}>
                {(shifts.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Work Order *">
              <select
                className="input"
                value={form.planId}
                onChange={(e) => setForm({ ...form, planId: e.target.value })}
              >
                <option value="">Select work order…</option>
                {(formPlans.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {formatWorkOrder(p.planNumber)} · {p.productionDate?.slice(0, 10)} · {p.line?.code || p.line?.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {selectedPlan ? (
            <div className="mb-3 grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-2" style={{ borderColor: 'var(--border)' }}>
              <div><span style={{ color: 'var(--muted)' }}>Date:</span> {selectedPlan.productionDate?.slice(0, 10)}</div>
              <div><span style={{ color: 'var(--muted)' }}>Plant:</span> {selectedPlan.plant?.name || '—'}</div>
              <div><span style={{ color: 'var(--muted)' }}>Line:</span> {selectedPlan.line?.code || selectedPlan.line?.name}</div>
              <div><span style={{ color: 'var(--muted)' }}>Shift:</span> {selectedPlan.shift?.name}</div>
            </div>
          ) : null}

          <Field label="Machine">
            <select className="input" value={form.machineId} onChange={(e) => setForm({ ...form, machineId: e.target.value })}>
              <option value="">Select machine…</option>
              {(machines.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>{m.name || m.code}</option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Breakdown Start *">
              <input className="input" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            </Field>
            <Field label="Breakdown End *">
              <input className="input" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
            </Field>
          </div>
          <Field label="Duration (min)">
            <input className="input" readOnly value={String(durationMins)} />
          </Field>

          <Field label="Breakdown Category *">
            <select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value, reason: '' })}>
              <option value="">Select category…</option>
              {breakdownCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Breakdown Reason *">
            <input
              className="input"
              list="bd-reason-list"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="e.g. Gearbox issue"
            />
            <datalist id="bd-reason-list">
              {reasonSuggestions.map((r) => (
                <option key={r.id} value={r.name} />
              ))}
            </datalist>
          </Field>

          <Field label="Failure Mode">
            <input
              className="input"
              list="failure-mode-list"
              value={form.failureMode}
              onChange={(e) => setForm({ ...form, failureMode: e.target.value })}
              placeholder="Mechanical / sensor / jam…"
            />
            <datalist id="failure-mode-list">
              {FAILURE_MODES.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Maintenance Type">
              <select className="input" value={form.maintenanceType} onChange={(e) => setForm({ ...form, maintenanceType: e.target.value })}>
                {MAINTENANCE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Technician">
            <input className="input" value={form.technician} onChange={(e) => setForm({ ...form, technician: e.target.value })} placeholder="Name" />
          </Field>

          <Field label="Corrective Action">
            <textarea className="input min-h-[4rem]" value={form.actionTaken} onChange={(e) => setForm({ ...form, actionTaken: e.target.value })} />
          </Field>

          <Field label="Root Cause">
            <textarea className="input min-h-[4rem]" value={form.rootCause} onChange={(e) => setForm({ ...form, rootCause: e.target.value })} placeholder="5 Why / fishbone outcome" />
          </Field>

          <Field label="Spare Parts Used">
            <input className="input" value={form.sparePartsUsed} onChange={(e) => setForm({ ...form, sparePartsUsed: e.target.value })} />
          </Field>

          <Field label="Remarks">
            <input className="input" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </Field>

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn btn-primary" type="button" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : editingId ? 'Update Breakdown' : 'Save Breakdown'}
            </button>
            {editingId ? (
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm());
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>

        <div className="panel overflow-hidden p-0">
          <div className="border-b px-4 py-3 font-semibold" style={{ borderColor: 'var(--border)' }}>
            Breakdown History
          </div>
          <div className="max-h-[calc(100vh-14rem)] overflow-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--panel)]">
                <tr className="border-b text-xs uppercase tracking-wide" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Machine</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2 text-right">Min</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 w-20" />
                </tr>
              </thead>
              <tbody>
                {(list.data ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--muted)' }}>
                      No breakdowns in this period
                    </td>
                  </tr>
                ) : (
                  (list.data ?? []).map((row) => (
                    <tr key={row.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {row.plan?.productionDate?.slice(0, 10) ?? row.startTime.slice(0, 10)}
                      </td>
                      <td className="px-3 py-2">{row.machine?.name || '—'}</td>
                      <td className="max-w-[10rem] truncate px-3 py-2" title={row.reason?.name}>{row.reason?.name || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{Math.round(row.durationMins)}</td>
                      <td className="px-3 py-2">
                        <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <IconButton label="Edit" onClick={() => startEdit(row)}>
                            <Pencil size={14} />
                          </IconButton>
                          <IconButton label="Delete" danger onClick={() => remove.mutate(row.id)}>
                            <Trash2 size={14} />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs" style={{ color: 'var(--muted)' }}>
        Flow: Breakdown → RCA → Corrective Action → Verification. View aggregated metrics on{' '}
        <Link to="/maintenance-reliability" className="underline">Maintenance Dashboard</Link>.
      </p>
    </div>
  );
}
