import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { type ApiResponse } from '../lib/api';
import { Field, LoadingBlock, PageHeader } from '../components/ui';
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

const UNITS = ['pcs', 'kg'] as const;

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
type PlanDetail = {
  id: string;
  planNumber: string;
  productionDate: string;
  batchNumber: string;
  product: { id: string; name: string; brand?: { name: string } | null };
  sku: { id: string; code: string; name?: string; packVolume?: string | null; packSize?: number | null };
  line: { id: string; name: string; code?: string };
  shift: { id: string; name: string; code?: string };
  productionEntries: Array<{ actualCases: number }>;
};
type WasteRow = {
  id: string;
  wasteDate: string;
  quantity: number;
  actualQtyIssued?: number | null;
  unit: string;
  reason: string;
  remarks?: string | null;
  materialId: string;
  planId?: string | null;
  material: Material;
};

type RowDraft = {
  materialId: string;
  entryId?: string;
  unit: string;
  actualQtyIssued: string;
  reason: string;
  remarks: string;
};

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateDisplay(raw: string) {
  const d = new Date(`${String(raw).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
}

function packSizeFromVolume(volume?: string | null) {
  const v = (volume || '').toUpperCase();
  if (v.includes('200')) return 36;
  if (v.includes('250')) return 30;
  if (v.includes('300') || v.includes('500')) return 24;
  if (v.includes('750') || v.includes('1000')) return 12;
  if (v.includes('2000')) return 6;
  if (v.includes('JAR')) return 1;
  return null;
}

function resolvePackSize(sku?: PlanDetail['sku'] | null) {
  if (sku?.packSize != null && Number(sku.packSize) > 0) return Number(sku.packSize);
  return packSizeFromVolume(sku?.packVolume) ?? 24;
}

/** Wastage only when issued ≥ std; otherwise not accepted (0). */
function calcWastageQty(actualIssued: number | null, stdQuantity: number) {
  if (actualIssued == null || Number.isNaN(actualIssued) || actualIssued < stdQuantity) return null;
  return Number((actualIssued - stdQuantity).toFixed(4));
}

function calcWastagePct(wastageQty: number | null, actualIssued: number | null) {
  if (wastageQty == null || actualIssued == null || actualIssued <= 0) return null;
  return Number(((wastageQty / actualIssued) * 100).toFixed(2));
}

export default function WasteEntriesPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [reportDate, setReportDate] = useState(() => searchParams.get('date') || today());
  const [shiftFilter, setShiftFilter] = useState('');
  const [planId, setPlanId] = useState(() => searchParams.get('planId') || '');
  const [rows, setRows] = useState<RowDraft[]>([]);
  const [editing, setEditing] = useState(true);
  const [snapshot, setSnapshot] = useState<RowDraft[]>([]);

  // Apply deep-link from Wastage Status page
  useEffect(() => {
    const d = searchParams.get('date');
    const p = searchParams.get('planId');
    if (d) setReportDate(d);
    if (p) setPlanId(p);
    if (searchParams.get('edit') === '1') setEditing(true);
  }, [searchParams]);

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

  useEffect(() => {
    if (plans.isLoading || !plans.data) return;
    if (planId && plans.data.some((p) => p.id === planId)) return;
    setPlanId(plans.data[0]?.id || '');
  }, [plans.data, plans.isLoading, planId]);

  const planDetail = useQuery({
    queryKey: ['plan-waste-detail', planId],
    enabled: Boolean(planId),
    queryFn: async () => (await api.get<ApiResponse<PlanDetail>>(`/plans/${planId}`)).data.data,
  });

  const entries = useQuery({
    queryKey: ['waste-entries', planId],
    enabled: Boolean(planId),
    queryFn: async () =>
      (
        await api.get<ApiResponse<WasteRow[]>>('/waste-entries', {
          params: { planId },
        })
      ).data.data,
  });

  const actualCases = useMemo(() => {
    const list = planDetail.data?.productionEntries ?? [];
    return list.reduce((s, e) => s + (Number(e.actualCases) || 0), 0);
  }, [planDetail.data]);

  const packSize = useMemo(
    () => resolvePackSize(planDetail.data?.sku),
    [planDetail.data?.sku],
  );

  const stdQuantity = actualCases * packSize;
  const skuLabel =
    planDetail.data?.sku?.packVolume ||
    planDetail.data?.sku?.name ||
    planDetail.data?.sku?.code ||
    '—';

  useEffect(() => {
    if (!materials.data || !planId) {
      setRows([]);
      return;
    }
    if (entries.isLoading) return;
    const byMaterial = new Map((entries.data ?? []).map((e) => [e.materialId, e]));
    const next = materials.data.map((m) => {
      const existing = byMaterial.get(m.id);
      const unitRaw = (existing?.unit || m.defaultUnit || 'pcs').toLowerCase();
      const storedWastage = existing ? Number(existing.quantity) || 0 : 0;
      const storedIssued =
        existing?.actualQtyIssued != null && Number(existing.actualQtyIssued) > 0
          ? Number(existing.actualQtyIssued)
          : null;
      const issued =
        storedIssued != null
          ? storedIssued
          : existing && storedWastage > 0
            ? stdQuantity + storedWastage
            : null;
      return {
        materialId: m.id,
        entryId: existing?.id,
        unit: unitRaw === 'kg' ? 'kg' : 'pcs',
        actualQtyIssued: issued != null ? String(issued) : '',
        reason: existing?.reason || '',
        remarks: existing?.remarks || '',
      };
    });
    setRows(next);
    setSnapshot(next.map((r) => ({ ...r })));
  }, [materials.data, entries.data, entries.isLoading, planId, stdQuantity]);

  // View vs edit when switching work order / deep-link (wait for entries)
  useEffect(() => {
    if (!planId || entries.isLoading) return;
    if (searchParams.get('edit') === '1') {
      setEditing(true);
      return;
    }
    setEditing((entries.data ?? []).length === 0);
  }, [planId, entries.isLoading, entries.dataUpdatedAt, searchParams]);


  function updateRow(materialId: string, patch: Partial<RowDraft>) {
    if (!editing) return;
    setRows((prev) => prev.map((r) => (r.materialId === materialId ? { ...r, ...patch } : r)));
  }

  const hasSavedEntries = (entries.data ?? []).length > 0;

  function startEdit() {
    setSnapshot(rows.map((r) => ({ ...r })));
    setEditing(true);
  }

  function cancelEdit() {
    setRows(snapshot.map((r) => ({ ...r })));
    setEditing(false);
  }

  const saveAll = useMutation({
    mutationFn: async () => {
      if (!planId) throw new Error('Select a work order');
      const matList = materials.data ?? [];
      const ops: Promise<unknown>[] = [];

      for (const row of rows) {
        const name = matList.find((m) => m.id === row.materialId)?.name || 'material';
        const issuedRaw = row.actualQtyIssued.trim();
        const issued = Number(issuedRaw);
        const hasIssued = issuedRaw !== '' && !Number.isNaN(issued);

        if (!hasIssued || issued <= 0) {
          if (row.entryId) ops.push(api.delete(`/waste-entries/${row.entryId}`));
          continue;
        }

        // Below std — do not accept
        if (issued < stdQuantity) {
          throw new Error(
            `${name}: Actual Qty Issued (${issued}) is less than Std Quantity (${stdQuantity}) — not accepted`,
          );
        }

        const wastage = calcWastageQty(issued, stdQuantity) ?? 0;
        if (wastage > 0 && !row.reason.trim()) {
          throw new Error(`Select a reason for ${name}`);
        }

        const payload = {
          wasteDate: reportDate,
          planId,
          materialId: row.materialId,
          quantity: wastage,
          actualQtyIssued: issued,
          unit: row.unit || 'pcs',
          reason: row.reason.trim() || '',
          remarks: row.remarks.trim() || null,
        };

        if (row.entryId) {
          ops.push(api.patch(`/waste-entries/${row.entryId}`, payload));
        } else {
          ops.push(api.post('/waste-entries', payload));
        }
      }

      await Promise.all(ops);
    },
    onSuccess: async () => {
      toast.success(hasSavedEntries ? 'Wastage entries updated' : 'Wastage entries saved');
      setEditing(false);
      await qc.invalidateQueries({ queryKey: ['waste-entries'] });
      await qc.invalidateQueries({ queryKey: ['waste-report'] });
      await qc.invalidateQueries({ queryKey: ['wastage-wo-status'] });
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

  async function downloadExcel() {
    if (!planId) {
      toast.error('Select a work order first');
      return;
    }
    try {
      const res = await api.get('/waste-entries/export/excel', {
        responseType: 'blob',
        params: { planId },
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      const wo = formatWorkOrder(planDetail.data?.planNumber || 'wo');
      const date = String(planDetail.data?.productionDate || reportDate).slice(0, 10);
      a.download = `waste-entries-${wo}-${date}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel downloaded');
    } catch {
      toast.error('Excel download failed');
    }
  }

  if (materials.isLoading || plans.isLoading) return <LoadingBlock />;

  const p = planDetail.data;

  return (
    <div>
      <PageHeader
        title="Wastage Entries"
        subtitle={
          editing
            ? hasSavedEntries
              ? 'Edit mode — update issued qty, then save'
              : 'Enter issued qty per material — wastage calculates automatically'
            : 'View mode — click Edit to change wastage entries'
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/wastage-status" className="btn btn-secondary">
              Work Order Status
            </Link>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={!planId || planDetail.isLoading}
              onClick={() => void downloadExcel()}
            >
              Download Excel
            </button>
            {!editing && hasSavedEntries ? (
              <button
                className="btn btn-primary"
                type="button"
                disabled={!planId || planDetail.isLoading}
                onClick={startEdit}
              >
                Edit
              </button>
            ) : null}
            {editing && hasSavedEntries ? (
              <button className="btn btn-secondary" type="button" onClick={cancelEdit} disabled={saveAll.isPending}>
                Cancel
              </button>
            ) : null}
            {editing ? (
              <button
                className="btn btn-primary"
                disabled={!planId || saveAll.isPending || planDetail.isLoading}
                onClick={() => saveAll.mutate()}
              >
                {saveAll.isPending ? 'Saving…' : hasSavedEntries ? 'Update Wastage Entries' : 'Save Wastage Entries'}
              </button>
            ) : null}
          </div>
        }
      />

      <div className="panel mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Production Date">
            <input
              className="input w-full"
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
              className="input w-full"
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
              className="input w-full"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              disabled={(plans.data ?? []).length === 0}
            >
              {(plans.data ?? []).length === 0 ? (
                <option value="">No work orders for this date</option>
              ) : (
                (plans.data ?? []).map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {formatWorkOrder(pl.planNumber)} — {pl.line?.code || pl.line?.name} / {pl.shift?.name}
                    {pl.product?.name ? ` / ${pl.product.name}` : ''}
                  </option>
                ))
              )}
            </select>
          </Field>
          <div className="flex items-end">
            <button type="button" className="btn btn-secondary" onClick={() => setReportDate(today())}>
              Today
            </button>
          </div>
        </div>
      </div>

      {!planId ? (
        <div className="panel mb-4 p-5 text-sm" style={{ color: 'var(--muted)' }}>
          No work orders for <strong style={{ color: 'var(--text)' }}>{reportDate}</strong>
          {shiftFilter ? ' with the selected shift' : ''}. Create them in Work Order Planning first.
        </div>
      ) : planDetail.isLoading || entries.isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="panel overflow-hidden p-0">
          <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)', background: 'var(--panel-2)' }}>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10">
              <HeaderCell label="Date" value={formatDateDisplay(String(p?.productionDate || reportDate))} />
              <HeaderCell label="Line" value={p?.line?.code || p?.line?.name || '—'} />
              <HeaderCell label="WO" value={formatWorkOrder(p?.planNumber)} />
              <HeaderCell label="Shift" value={p?.shift?.name || '—'} />
              <HeaderCell label="Product" value={p?.product?.name || '—'} />
              <HeaderCell label="SKU" value={skuLabel} />
              <HeaderCell label="Batch" value={p?.batchNumber || '—'} />
              <HeaderCell label="Pack" value={String(packSize)} />
              <HeaderCell label="Cases" value={actualCases.toLocaleString()} />
              <HeaderCell label="Std qty" value={stdQuantity.toLocaleString()} />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="wastage-entry-table w-full text-sm">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>UOM</th>
                  <th>Std qty</th>
                  <th>Actual qty issued</th>
                  <th>Wastage qty</th>
                  <th>Wastage %</th>
                  <th>Reason</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center" style={{ color: 'var(--muted)' }}>
                      No materials configured
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const mat = (materials.data ?? []).find((m) => m.id === row.materialId);
                    const issuedRaw = row.actualQtyIssued.trim();
                    const issuedNum = issuedRaw === '' ? null : Number(issuedRaw);
                    const belowStd =
                      issuedNum != null && !Number.isNaN(issuedNum) && issuedNum > 0 && issuedNum < stdQuantity;
                    const wastageNum = calcWastageQty(
                      issuedNum != null && !Number.isNaN(issuedNum) ? issuedNum : null,
                      stdQuantity,
                    );
                    const pct = calcWastagePct(
                      wastageNum,
                      issuedNum != null && !Number.isNaN(issuedNum) ? issuedNum : null,
                    );

                    return (
                      <tr key={row.materialId} style={belowStd ? { background: 'color-mix(in srgb, var(--danger) 6%, transparent)' } : undefined}>
                        <td className="font-medium whitespace-nowrap">{mat?.name || '—'}</td>
                        <td>
                          <select
                            className="input"
                            style={{ width: '4.5rem', minWidth: '4.5rem' }}
                            value={row.unit}
                            disabled={!editing}
                            onChange={(e) => updateRow(row.materialId, { unit: e.target.value })}
                          >
                            {UNITS.map((u) => (
                              <option key={u} value={u}>
                                {u.toUpperCase()}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="tabular-nums whitespace-nowrap">{stdQuantity.toLocaleString()}</td>
                        <td>
                          <input
                            className="input"
                            style={{ width: '7.5rem' }}
                            type="number"
                            min={0}
                            step="any"
                            placeholder={`≥ ${stdQuantity}`}
                            value={row.actualQtyIssued}
                            disabled={!editing}
                            onChange={(e) => updateRow(row.materialId, { actualQtyIssued: e.target.value })}
                          />
                          {editing && belowStd ? (
                            <div className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>
                              ≥ {stdQuantity.toLocaleString()} required
                            </div>
                          ) : null}
                        </td>
                        <td className="tabular-nums font-medium whitespace-nowrap">
                          {wastageNum != null ? wastageNum.toLocaleString() : belowStd ? '0' : '—'}
                        </td>
                        <td className="tabular-nums font-medium whitespace-nowrap">
                          {pct != null ? `${pct}%` : '—'}
                        </td>
                        <td>
                          <select
                            className="input"
                            style={{ width: '11rem', minWidth: '11rem' }}
                            value={row.reason}
                            disabled={!editing}
                            onChange={(e) => updateRow(row.materialId, { reason: e.target.value })}
                          >
                            <option value="">Select…</option>
                            {REASONS.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            className="input"
                            style={{ width: '100%', minWidth: '8rem' }}
                            value={row.remarks}
                            placeholder="Notes"
                            disabled={!editing}
                            onChange={(e) => updateRow(row.materialId, { remarks: e.target.value })}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div
            className="flex flex-wrap gap-x-4 gap-y-1 border-t px-4 py-2.5 text-xs"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            <span>
              Std = Cases × Pack = <strong style={{ color: 'var(--text)' }}>{stdQuantity.toLocaleString()}</strong>
            </span>
            <span>Wastage = Issued − Std (only if Issued ≥ Std)</span>
            <span>Wastage % = Wastage ÷ Issued</span>
          </div>
        </div>
      )}
    </div>
  );
}

function HeaderCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
        {label}
      </div>
      <div className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text)' }}>
        {value}
      </div>
    </div>
  );
}
