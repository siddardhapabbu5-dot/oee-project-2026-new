import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api, { type ApiResponse } from '../lib/api';
import { DateWithIcon, Field, IconButton, LoadingBlock, Modal, PageHeader } from '../components/ui';
import { formatWorkOrder } from '../lib/workOrder';

const REASONS = [
  'Damaged / broken',
  'Process reject',
  'Startup scrap',
  'Handling loss',
  'Supplier defect',
  'Changeover scrap',
  'Other',
] as const;

type Material = { id: string; code: string; name: string; defaultUnit: string };
type PlanRow = {
  id: string;
  planNumber: string;
  productionDate: string;
  batchNumber?: string;
  lineId: string;
  shiftId: string;
  line: { name: string; code?: string };
  shift: { id?: string; name: string };
  product?: { name: string };
};
type WasteRow = {
  id: string;
  wasteDate: string;
  quantity: number;
  unit: string;
  reason: string;
  remarks?: string | null;
  materialId: string;
  planId?: string | null;
  shiftId?: string | null;
  lineId?: string | null;
  material: Material;
  plan?: { id: string; planNumber: string; batchNumber?: string } | null;
  shift?: { id: string; name: string } | null;
  line?: { id: string; name: string; code?: string } | null;
};

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function WasteEntriesPage() {
  const qc = useQueryClient();
  const [reportDate, setReportDate] = useState(() => today());
  const [shiftFilter, setShiftFilter] = useState('');
  const [planId, setPlanId] = useState('');
  const [materialFilter, setMaterialFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WasteRow | null>(null);
  const [form, setForm] = useState({
    materialId: '',
    quantity: '',
    unit: '',
    reason: REASONS[0] as string,
    remarks: '',
  });

  const materials = useQuery({
    queryKey: ['waste-materials'],
    queryFn: async () => (await api.get<ApiResponse<Material[]>>('/waste-materials')).data.data,
  });

  const shifts = useQuery({
    queryKey: ['shifts-waste'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/shifts')).data.data,
  });

  const plans = useQuery({
    queryKey: ['plans-waste', reportDate, shiftFilter],
    enabled: Boolean(reportDate),
    queryFn: async () =>
      (
        await api.get<ApiResponse<PlanRow[]>>('/plans', {
          params: {
            limit: 100,
            from: reportDate,
            to: reportDate,
            ...(shiftFilter ? { shiftId: shiftFilter } : {}),
          },
        })
      ).data.data,
  });

  // Keep selected WO inside the filtered list for the date
  useEffect(() => {
    if (plans.isLoading || !plans.data) return;
    if (planId && plans.data.some((p) => p.id === planId)) return;
    setPlanId(plans.data[0]?.id || '');
  }, [plans.data, plans.isLoading, planId]);

  const selectedPlan = useMemo(
    () => (plans.data ?? []).find((p) => p.id === planId) || null,
    [plans.data, planId],
  );

  const entries = useQuery({
    queryKey: ['waste-entries', planId, materialFilter],
    enabled: Boolean(planId),
    queryFn: async () =>
      (
        await api.get<ApiResponse<WasteRow[]>>('/waste-entries', {
          params: {
            planId,
            ...(materialFilter ? { materialId: materialFilter } : {}),
          },
        })
      ).data.data,
  });

  const selectedMaterial = useMemo(
    () => (materials.data ?? []).find((m) => m.id === form.materialId),
    [materials.data, form.materialId],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!planId && !editing?.planId) throw new Error('Select a work order');
      const woId = editing?.planId || planId;
      const payload = {
        wasteDate: reportDate,
        planId: woId,
        materialId: form.materialId,
        quantity: Number(form.quantity),
        unit: form.unit || selectedMaterial?.defaultUnit || 'pcs',
        reason: form.reason,
        remarks: form.remarks || null,
      };
      if (!payload.materialId) throw new Error('Select a material');
      if (!payload.quantity || payload.quantity <= 0) throw new Error('Enter quantity');
      if (editing) {
        return (await api.patch(`/waste-entries/${editing.id}`, payload)).data.data;
      }
      return (await api.post('/waste-entries', payload)).data.data;
    },
    onSuccess: async () => {
      toast.success(editing ? 'Waste entry updated' : 'Waste entry saved');
      setOpen(false);
      setEditing(null);
      setForm({ materialId: '', quantity: '', unit: '', reason: REASONS[0], remarks: '' });
      await qc.invalidateQueries({ queryKey: ['waste-entries'] });
      await qc.invalidateQueries({ queryKey: ['waste-report'] });
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } }; message?: string })?.response?.data?.error
          ?.message ||
        (e as { message?: string })?.message ||
        'Save failed';
      toast.error(msg);
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/waste-entries/${id}`)).data.data,
    onSuccess: async () => {
      toast.success('Deleted');
      await qc.invalidateQueries({ queryKey: ['waste-entries'] });
      await qc.invalidateQueries({ queryKey: ['waste-report'] });
    },
  });

  function openCreate() {
    if (!planId) {
      toast.error('Select a work order first');
      return;
    }
    setEditing(null);
    setForm({ materialId: '', quantity: '', unit: '', reason: REASONS[0], remarks: '' });
    setOpen(true);
  }

  function openEdit(row: WasteRow) {
    setEditing(row);
    setForm({
      materialId: row.materialId,
      quantity: String(row.quantity),
      unit: row.unit,
      reason: row.reason,
      remarks: row.remarks || '',
    });
    setOpen(true);
  }

  if (materials.isLoading || plans.isLoading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Waste Entries"
        subtitle="Enter raw-material waste against each work order (date-wise)"
        actions={
          <button className="btn btn-primary" onClick={openCreate} disabled={!planId}>
            <Plus size={16} strokeWidth={2} />
            New Waste Entry
          </button>
        }
      />

      <div className="panel mb-4 flex flex-wrap items-end gap-3 p-4">
        <Field label="Production Date">
          <input
            className="input"
            type="date"
            value={reportDate}
            max={today()}
            onChange={(e) => {
              setReportDate(e.target.value);
              setPlanId('');
            }}
          />
        </Field>
        <Field label="Shift">
          <select
            className="input min-w-[10rem]"
            value={shiftFilter}
            onChange={(e) => {
              setShiftFilter(e.target.value);
              setPlanId('');
            }}
          >
            <option value="">All shifts</option>
            {(shifts.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Work Order">
          <select
            className="input min-w-[16rem]"
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            disabled={(plans.data ?? []).length === 0}
          >
            {(plans.data ?? []).length === 0 ? (
              <option value="">No work orders for this date</option>
            ) : (
              (plans.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {formatWorkOrder(p.planNumber)} — {p.line?.code || p.line?.name} / {p.shift?.name}
                  {p.product?.name ? ` / ${p.product.name}` : ''}
                </option>
              ))
            )}
          </select>
        </Field>
        <Field label="Material">
          <select className="input min-w-[10rem]" value={materialFilter} onChange={(e) => setMaterialFilter(e.target.value)}>
            <option value="">All materials</option>
            {(materials.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <button type="button" className="btn btn-secondary" onClick={() => setReportDate(today())}>
          Today
        </button>
      </div>

      {selectedPlan ? (
        <div className="panel mb-4 grid gap-2 p-4 text-sm sm:grid-cols-4" style={{ color: 'var(--muted)' }}>
          <div>
            Work Order:{' '}
            <strong style={{ color: 'var(--text)' }}>{formatWorkOrder(selectedPlan.planNumber)}</strong>
          </div>
          <div>
            Line:{' '}
            <strong style={{ color: 'var(--text)' }}>
              {selectedPlan.line?.code || selectedPlan.line?.name}
            </strong>
          </div>
          <div>
            Shift: <strong style={{ color: 'var(--text)' }}>{selectedPlan.shift?.name}</strong>
          </div>
          <div>
            Date:{' '}
            <strong style={{ color: 'var(--text)' }}>{String(selectedPlan.productionDate).slice(0, 10)}</strong>
          </div>
        </div>
      ) : (
        <div className="panel mb-4 p-4 text-sm" style={{ color: 'var(--muted)' }}>
          No work orders for <strong style={{ color: 'var(--text)' }}>{reportDate}</strong>
          {shiftFilter ? ' with the selected shift' : ''}. Create them in Work Order Planning first.
        </div>
      )}

      {!planId ? null : entries.isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="table-wrap fit-cols panel">
          <table className="data entry-log">
            <thead>
              <tr>
                <th>Work Order</th>
                <th>Date</th>
                <th>Material</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Reason</th>
                <th>Shift</th>
                <th>Line</th>
                <th>Remarks</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(entries.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center" style={{ color: 'var(--muted)' }}>
                    No waste logged for work order {formatWorkOrder(selectedPlan?.planNumber)}
                  </td>
                </tr>
              ) : (
                (entries.data ?? []).map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono font-medium">
                      {formatWorkOrder(row.plan?.planNumber || selectedPlan?.planNumber)}
                    </td>
                    <td>
                      <DateWithIcon value={row.wasteDate} />
                    </td>
                    <td>{row.material?.name}</td>
                    <td className="tabular-nums">{row.quantity}</td>
                    <td>{row.unit}</td>
                    <td>{row.reason}</td>
                    <td>{row.shift?.name || selectedPlan?.shift?.name || '—'}</td>
                    <td>{row.line?.code || row.line?.name || selectedPlan?.line?.code || '—'}</td>
                    <td title={row.remarks || ''}>{row.remarks || '—'}</td>
                    <td className="col-actions">
                      <div className="row-actions">
                        <IconButton title="Edit" primary onClick={() => openEdit(row)}>
                          <Pencil size={15} strokeWidth={1.75} />
                        </IconButton>
                        <IconButton
                          title="Delete"
                          danger
                          onClick={() => {
                            if (window.confirm('Delete this waste entry?')) remove.mutate(row.id);
                          }}
                        >
                          <Trash2 size={15} strokeWidth={1.75} />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={open}
        title={editing ? 'Edit Waste Entry' : `Waste — WO ${formatWorkOrder(selectedPlan?.planNumber)}`}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <div className="mb-3 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--panel-2)', color: 'var(--muted)' }}>
          Work order <strong style={{ color: 'var(--text)' }}>{formatWorkOrder(selectedPlan?.planNumber)}</strong>
          {' · '}
          {selectedPlan?.line?.code || selectedPlan?.line?.name}
          {' · '}
          {selectedPlan?.shift?.name}
          {' · '}
          {reportDate}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Material *">
            <select
              className="input"
              value={form.materialId}
              onChange={(e) => {
                const id = e.target.value;
                const m = (materials.data ?? []).find((x) => x.id === id);
                setForm({ ...form, materialId: id, unit: m?.defaultUnit || form.unit });
              }}
            >
              <option value="">Select material…</option>
              {(materials.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity *">
            <input
              className="input"
              type="number"
              min={0}
              step="any"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
          </Field>
          <Field label="Unit">
            <input
              className="input"
              value={form.unit}
              placeholder={selectedMaterial?.defaultUnit || 'pcs'}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            />
          </Field>
          <Field label="Reason *">
            <select className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Remarks">
            <input className="input" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
