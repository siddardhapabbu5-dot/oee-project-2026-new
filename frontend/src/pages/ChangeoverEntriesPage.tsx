import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api, { type ApiResponse } from '../lib/api';
import { DateWithIcon, Field, IconButton, LoadingBlock, PageHeader } from '../components/ui';

const REASON_OPTIONS = ['As per production plan', 'RAW material issue'] as const;

type Sku = { id: string; code: string; name: string; packVolume?: string | null; productId: string };
type ChangeoverRow = {
  id: string;
  kind: string;
  standardMins: number;
  actualMins: number;
  reason?: string | null;
  remarks?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  productionDate?: string | null;
  lineId?: string | null;
  changeoverTypeId: string;
  fromProductId: string;
  toProductId: string;
  fromSkuId?: string | null;
  toSkuId?: string | null;
  line?: { id: string; code?: string; name: string } | null;
  changeoverType?: { id: string; name: string; standardMins: number } | null;
  fromProduct?: { id: string; name: string } | null;
  toProduct?: { id: string; name: string } | null;
  fromSku?: { id: string; code: string; name: string; packVolume?: string | null } | null;
  toSku?: { id: string; code: string; name: string; packVolume?: string | null } | null;
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function formatTime24(value: string | Date | null | undefined) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toTimeOnly(d: Date) {
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

const PACK_VOLUME_ORDER = ['200 ML', '250 ML', '300 ML', '500 ML', '750 ML', '1000 ML', '2000 ML', 'Jar-20L'] as const;

const CATALOG_SKU_CODES: Record<(typeof PACK_VOLUME_ORDER)[number], string> = {
  '200 ML': 'SKU-200-ML',
  '250 ML': 'SKU-250-ML',
  '300 ML': 'SKU-300-ML',
  '500 ML': 'SKU-500-ML',
  '750 ML': 'SKU-750-ML',
  '1000 ML': 'SKU-1000-ML',
  '2000 ML': 'SKU-2000-ML',
  'Jar-20L': 'SKU-JAR-20L',
};

function skuLabel(
  s?: { packVolume?: string | null; name?: string; code?: string } | null,
  catalog?: Array<{ id: string; label: string }>,
  skuId?: string | null,
) {
  if (catalog && skuId) {
    const hit = catalog.find((c) => c.id === skuId);
    if (hit) return hit.label;
  }
  const pack = (s?.packVolume || '').trim();
  if (pack) {
    const known = PACK_VOLUME_ORDER.find((p) => p.toUpperCase() === pack.toUpperCase());
    if (known) return known;
  }
  return s?.packVolume || s?.name || s?.code || '—';
}

/** Fixed SKU pack list for changeover entry (same as Production Planning). */
function resolveCatalogSkus(all: Sku[]) {
  return PACK_VOLUME_ORDER.map((label) => {
    const code = CATALOG_SKU_CODES[label];
    const found =
      all.find((s) => s.code === code) ||
      all.find((s) => (s.packVolume || '').toUpperCase() === label.toUpperCase()) ||
      all.find((s) => (s.name || '').toUpperCase() === label.toUpperCase());
    return found ? { id: found.id, label } : { id: '', label };
  }).filter((s) => !!s.id) as Array<{ id: string; label: string }>;
}

function matchCatalogSkuId(all: Sku[], catalog: Array<{ id: string; label: string }>, skuId?: string | null) {
  if (!skuId) return '';
  if (catalog.some((s) => s.id === skuId)) return skuId;
  const current = all.find((s) => s.id === skuId);
  if (!current) return skuId;
  const pack = (current.packVolume || current.name || '').trim().toUpperCase();
  const hit = catalog.find(
    (s) =>
      s.label.toUpperCase() === pack ||
      (s.label.toUpperCase() === 'JAR-20L' && /20\s*L|JAR/i.test(pack)),
  );
  return hit?.id || skuId;
}

const emptyForm = (): Record<string, string> => ({
  productionDate: new Date().toISOString().slice(0, 10),
  kind: 'PLANNED',
  reason: REASON_OPTIONS[0],
});

export default function ChangeoverEntriesPage() {
  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ['changeover-entries'],
    queryFn: async () => (await api.get<ApiResponse<ChangeoverRow[]>>('/changeover-entries')).data.data,
  });

  const lines = useQuery({
    queryKey: ['lines'],
    queryFn: async () =>
      (
        await api.get<ApiResponse<Array<{ id: string; code: string; name: string }>>>('/lines', { params: { limit: 100 } })
      ).data.data,
  });

  const products = useQuery({
    queryKey: ['products'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/products', { params: { limit: 200 } })).data
        .data,
  });

  const skus = useQuery({
    queryKey: ['skus'],
    queryFn: async () =>
      (await api.get<ApiResponse<Sku[]>>('/skus', { params: { limit: 500 } })).data.data,
  });

  const coTypes = useQuery({
    queryKey: ['changeover-types'],
    queryFn: async () =>
      (
        await api.get<ApiResponse<Array<{ id: string; name: string; code?: string; standardMins: number }>>>(
          '/changeover-types',
        )
      ).data.data,
  });

  const selectedType = useMemo(
    () => (coTypes.data ?? []).find((t) => t.id === form.changeoverTypeId) ?? null,
    [coTypes.data, form.changeoverTypeId],
  );

  const catalogSkus = useMemo(() => resolveCatalogSkus(skus.data ?? []), [skus.data]);

  // Always keep Standard mins in sync with the selected Change Over Type master
  useEffect(() => {
    if (!form.changeoverTypeId || !selectedType) return;
    const next = String(selectedType.standardMins ?? '');
    if (form.standardMins === next) return;
    setForm((prev) => ({ ...prev, standardMins: next }));
  }, [form.changeoverTypeId, selectedType, form.standardMins]);

  const fromSkus = catalogSkus;
  const toSkus = catalogSkus;

  const totalMins = useMemo(
    () => minsBetweenTimes(form.productionDate || '', form.startTime, form.endTime),
    [form.productionDate, form.startTime, form.endTime],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!form.productionDate) throw new Error('Enter date');
      if (!form.lineId) throw new Error('Select production line');
      if (!form.changeoverTypeId) throw new Error('Select changeover type');
      if (!form.fromProductId) throw new Error('Select from product');
      if (!form.fromSkuId) throw new Error('Select from SKU');
      if (!form.toProductId) throw new Error('Select to product');
      if (!form.toSkuId) throw new Error('Select to SKU');
      if (!form.startTime || !form.endTime) throw new Error('Enter start and end time');

      const startTime = combineDateAndTime(form.productionDate, form.startTime);
      let endTime = combineDateAndTime(form.productionDate, form.endTime);
      if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
        throw new Error('Invalid changeover times');
      }
      if (endTime <= startTime) endTime = new Date(endTime.getTime() + 24 * 60 * 60 * 1000);

      const payload = {
        lineId: form.lineId,
        productionDate: form.productionDate,
        changeoverTypeId: form.changeoverTypeId,
        fromProductId: form.fromProductId,
        toProductId: form.toProductId,
        fromSkuId: form.fromSkuId,
        toSkuId: form.toSkuId,
        kind: (form.kind || 'PLANNED') as 'PLANNED' | 'UNPLANNED',
        standardMins: Number(
          form.standardMins ||
            selectedType?.standardMins ||
            (coTypes.data ?? []).find((t) => t.id === form.changeoverTypeId)?.standardMins ||
            0,
        ),
        actualMins: totalMins,
        reason: form.reason || null,
        remarks: form.remarks || null,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      };

      if (editingId) return api.patch(`/changeover-entries/${editingId}`, payload);
      return api.post('/changeover-entries', payload);
    },
    onSuccess: async () => {
      toast.success(editingId ? 'Changeover updated' : 'Changeover saved');
      setEditingId(null);
      setForm(emptyForm());
      await qc.invalidateQueries({ queryKey: ['changeover-entries'] });
    },
    onError: (e: unknown) => {
      const apiMsg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      const localMsg = e instanceof Error ? e.message : null;
      toast.error(apiMsg || localMsg || 'Save failed');
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/changeover-entries/${id}`),
    onSuccess: async () => {
      toast.success('Changeover deleted');
      if (editingId) {
        setEditingId(null);
        setForm(emptyForm());
      }
      await qc.invalidateQueries({ queryKey: ['changeover-entries'] });
    },
    onError: (e: unknown) =>
      toast.error((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Delete failed'),
  });

  function startEdit(row: ChangeoverRow) {
    setEditingId(row.id);
    setForm({
      productionDate: row.productionDate
        ? String(row.productionDate).slice(0, 10)
        : row.startTime
          ? String(row.startTime).slice(0, 10)
          : new Date().toISOString().slice(0, 10),
      lineId: row.lineId || row.line?.id || '',
      changeoverTypeId: row.changeoverTypeId || row.changeoverType?.id || '',
      fromProductId: row.fromProductId || row.fromProduct?.id || '',
      toProductId: row.toProductId || row.toProduct?.id || '',
      fromSkuId: matchCatalogSkuId(skus.data ?? [], catalogSkus, row.fromSkuId || row.fromSku?.id),
      toSkuId: matchCatalogSkuId(skus.data ?? [], catalogSkus, row.toSkuId || row.toSku?.id),
      standardMins: String(row.standardMins ?? row.changeoverType?.standardMins ?? ''),
      kind: row.kind || 'PLANNED',
      reason: row.reason || REASON_OPTIONS[0],
      remarks: row.remarks || '',
      startTime: row.startTime ? toTimeOnly(new Date(row.startTime)) : '',
      endTime: row.endTime ? toTimeOnly(new Date(row.endTime)) : '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
  }

  async function downloadExcel() {
    try {
      const res = await api.get('/changeover-entries/export/excel', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `changeover-details-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel downloaded');
    } catch {
      toast.error('Excel download failed');
    }
  }

  if (list.isLoading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Changeover Details"
        subtitle="Record planned / unplanned changeovers with product and SKU details"
        actions={
          <button className="btn btn-secondary" type="button" onClick={() => void downloadExcel()}>
            Download Excel
          </button>
        }
      />

      <div className="panel mb-4 p-4">
        <h3 className="mb-3 font-semibold">{editingId ? 'Edit Changeover' : 'Changeover Entry'}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Date">
            <input
              className="input"
              type="date"
              value={form.productionDate || ''}
              onChange={(e) => setForm({ ...form, productionDate: e.target.value })}
            />
          </Field>
          <Field label="Production Line">
            <select
              className="input"
              value={form.lineId || ''}
              onChange={(e) => setForm({ ...form, lineId: e.target.value })}
            >
              <option value="">Select line...</option>
              {(lines.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code || l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Change Over Type">
            <select
              className="input"
              value={form.changeoverTypeId || ''}
              onChange={(e) => {
                const id = e.target.value;
                const t = (coTypes.data ?? []).find((x) => x.id === id);
                setForm((prev) => ({
                  ...prev,
                  changeoverTypeId: id,
                  standardMins: id ? String(t?.standardMins ?? '') : '',
                }));
              }}
            >
              <option value="">Select type...</option>
              {(coTypes.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.standardMins} min)
                </option>
              ))}
            </select>
          </Field>

          <div className="sm:col-span-2 lg:col-span-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                From
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="From Product">
                  <select
                    className="input"
                    value={form.fromProductId || ''}
                    onChange={(e) => setForm({ ...form, fromProductId: e.target.value, fromSkuId: '' })}
                  >
                    <option value="">Select product...</option>
                    {(products.data ?? []).map((pr) => (
                      <option key={pr.id} value={pr.id}>
                        {pr.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="From SKU">
                  <select
                    className="input"
                    value={form.fromSkuId || ''}
                    onChange={(e) => setForm({ ...form, fromSkuId: e.target.value })}
                  >
                    <option value="">Select SKU...</option>
                    {fromSkus.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>

            <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                To
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="To Product">
                  <select
                    className="input"
                    value={form.toProductId || ''}
                    onChange={(e) => setForm({ ...form, toProductId: e.target.value, toSkuId: '' })}
                  >
                    <option value="">Select product...</option>
                    {(products.data ?? []).map((pr) => (
                      <option key={pr.id} value={pr.id}>
                        {pr.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="To SKU">
                  <select
                    className="input"
                    value={form.toSkuId || ''}
                    onChange={(e) => setForm({ ...form, toSkuId: e.target.value })}
                  >
                    <option value="">Select SKU...</option>
                    {toSkus.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </div>

          <Field label="Standard Changeover Time (mins)">
            <input
              className="input"
              type="number"
              min={0}
              readOnly
              value={form.standardMins || ''}
              title="Auto-filled from Change Over Type master"
              placeholder="Select change over type"
              style={{ background: 'var(--panel-2)', cursor: 'default' }}
            />
            <div className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              Auto-filled from Changeover Types master
              {selectedType ? ` · ${selectedType.name}` : ''}
            </div>
          </Field>
          <Field label="Start Time">
            <input
              className="input"
              type="time"
              value={form.startTime || ''}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            />
          </Field>
          <Field label="End Time">
            <input
              className="input"
              type="time"
              value={form.endTime || ''}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
            />
          </Field>
          <Field label="Total Changeover Time (mins)">
            <input className="input" type="number" value={String(totalMins)} readOnly />
          </Field>
          <Field label="Type of Plan">
            <select
              className="input"
              value={form.kind || 'PLANNED'}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
            >
              <option value="PLANNED">Planned</option>
              <option value="UNPLANNED">Unplanned</option>
            </select>
          </Field>
          <Field label="Reason for Changeover">
            <select
              className="input"
              value={form.reason || ''}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            >
              <option value="">Select reason...</option>
              {REASON_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Remarks">
            <input
              className="input"
              value={form.remarks || ''}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              placeholder="Optional remarks"
            />
          </Field>
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn btn-primary flex-1" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving...' : editingId ? 'Update Changeover' : 'Save Changeover'}
          </button>
          {editingId ? (
            <button className="btn btn-secondary" type="button" onClick={cancelEdit}>
              Cancel
            </button>
          ) : null}
        </div>
      </div>

      <div className="panel p-4">
        <h3 className="mb-3 font-semibold">Changeover Log</h3>
        {list.isError ? (
          <p className="text-sm text-red-600">Could not load changeovers. Refresh and try again.</p>
        ) : (
          <div className="table-wrap">
            <table className="data entry-log">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Line</th>
                  <th>From Product</th>
                  <th>From SKU</th>
                  <th>To Product</th>
                  <th>To SKU</th>
                  <th>Type</th>
                  <th>Plan</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Std</th>
                  <th>Total</th>
                  <th>Reason</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(list.data ?? []).map((c) => (
                  <tr key={c.id} className={editingId === c.id ? 'bg-blue-50/40' : undefined}>
                    <td>
                      <DateWithIcon value={c.productionDate || c.startTime || null} />
                    </td>
                    <td>{c.line?.code || c.line?.name || '—'}</td>
                    <td className="wrap">{c.fromProduct?.name || '—'}</td>
                    <td>{skuLabel(c.fromSku, catalogSkus, c.fromSkuId)}</td>
                    <td className="wrap">{c.toProduct?.name || '—'}</td>
                    <td>{skuLabel(c.toSku, catalogSkus, c.toSkuId)}</td>
                    <td className="wrap">{c.changeoverType?.name || '—'}</td>
                    <td>{c.kind === 'UNPLANNED' ? 'Unplanned' : 'Planned'}</td>
                    <td>{formatTime24(c.startTime)}</td>
                    <td>{formatTime24(c.endTime)}</td>
                    <td>{c.standardMins}</td>
                    <td>{c.actualMins}</td>
                    <td className="wrap">{c.reason || '—'}</td>
                    <td className="col-actions">
                      <div className="row-actions">
                        <IconButton title="Edit" primary type="button" onClick={() => startEdit(c)}>
                          <Pencil size={16} strokeWidth={1.75} />
                        </IconButton>
                        <IconButton
                          title="Delete"
                          danger
                          type="button"
                          disabled={remove.isPending}
                          onClick={() => {
                            if (window.confirm('Delete this changeover entry?')) remove.mutate(c.id);
                          }}
                        >
                          <Trash2 size={16} strokeWidth={1.75} />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
                {(list.data?.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={14} style={{ color: 'var(--muted)' }}>
                      No changeovers logged
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
