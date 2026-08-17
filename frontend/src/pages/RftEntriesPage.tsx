import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api, { type ApiResponse } from '../lib/api';
import { FilterBar, FilterField, FILTER_CTRL } from '../components/FilterBar';
import { Field, IconButton, KpiCard, LoadingBlock, PageHeader } from '../components/ui';

type RejectType = { id: string; code: string; name: string; example?: string | null };
type RejectArea = {
  id: string;
  code: string;
  name: string;
  shortLabel: string;
  types: RejectType[];
};

type RftRow = {
  id: string;
  entryDate: string;
  lineId: string;
  shiftId: string;
  productId: string;
  skuId: string;
  totalProduced: number;
  totalReject: number;
  firstTimeGood: number;
  rft: number | null;
  byArea: Record<string, number>;
  remarks?: string | null;
  line: { id: string; code: string; name: string };
  shift: { id: string; name: string };
  product: { id: string; name: string; brand?: { name: string } | null };
  sku: { id: string; code: string; name?: string; packVolume?: string | null };
  rejects: Array<{
    areaId: string;
    rejectTypeId?: string | null;
    quantity: number;
    area: { code: string; shortLabel: string };
    rejectType?: { id: string; name: string } | null;
  }>;
};

type ProductionSourceRow = {
  planId: string;
  planNumber: string;
  entryDate: string;
  lineId: string;
  lineCode: string;
  shiftId: string;
  shiftName: string;
  productId: string;
  productName: string;
  skuId: string;
  skuLabel: string;
  plannedCases: number;
  actualCases: number;
  goodCases: number;
  rejectCases: number;
  hourCount: number;
  totalProduced: number;
};

function localYmd(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthStart() {
  const d = new Date();
  return localYmd(new Date(d.getFullYear(), d.getMonth(), 1));
}

function fmtDate(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-');
}

export default function RftEntriesPage() {
  const qc = useQueryClient();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => localYmd());
  const [filterLineId, setFilterLineId] = useState('');
  const [filterShiftId, setFilterShiftId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showTypes, setShowTypes] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const autoFilledKey = useRef('');

  const [form, setForm] = useState({
    entryDate: localYmd(),
    lineId: '',
    shiftId: '',
    productId: '',
    skuId: '',
    totalProduced: '',
    remarks: '',
  });
  /** areaId -> qty string (area-level) */
  const [areaQty, setAreaQty] = useState<Record<string, string>>({});
  /** rejectTypeId -> qty string */
  const [typeQty, setTypeQty] = useState<Record<string, string>>({});

  const areas = useQuery({
    queryKey: ['reject-areas'],
    queryFn: async () => (await api.get<ApiResponse<RejectArea[]>>('/reject-areas')).data.data,
    staleTime: 300_000,
  });

  const lines = useQuery({
    queryKey: ['lines'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; code: string; name: string }>>>('/lines', { params: { limit: 100 } }))
        .data.data,
    staleTime: 300_000,
  });

  const shifts = useQuery({
    queryKey: ['shifts'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/shifts')).data.data,
    staleTime: 300_000,
  });

  const products = useQuery({
    queryKey: ['product-options'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/products/options')).data.data,
    staleTime: 300_000,
  });

  const skus = useQuery({
    queryKey: ['skus'],
    queryFn: async () =>
      (
        await api.get<
          ApiResponse<Array<{ id: string; code: string; name: string; productId: string; packVolume?: string | null }>>
        >('/skus', { params: { limit: 200 } })
      ).data.data,
    staleTime: 300_000,
  });

  const productionSource = useQuery({
    queryKey: ['rft-production-source', form.entryDate, form.shiftId, form.lineId],
    enabled: Boolean(form.entryDate && form.shiftId) && !editingId,
    queryFn: async () =>
      (
        await api.get<
          ApiResponse<{
            date: string;
            shiftId: string;
            rows: ProductionSourceRow[];
            totals: { planCount: number; actualCases: number; goodCases: number; rejectCases: number };
          }>
        >('/rft-entries/production-source', {
          params: {
            date: form.entryDate,
            shiftId: form.shiftId,
            ...(form.lineId ? { lineId: form.lineId } : {}),
          },
        })
      ).data.data,
    placeholderData: keepPreviousData,
  });

  const entries = useQuery({
    queryKey: ['rft-entries', from, to, filterLineId, filterShiftId],
    queryFn: async () =>
      (
        await api.get<ApiResponse<RftRow[]>>('/rft-entries', {
          params: {
            from,
            to,
            ...(filterLineId ? { lineId: filterLineId } : {}),
            ...(filterShiftId ? { shiftId: filterShiftId } : {}),
          },
        })
      ).data.data,
    placeholderData: keepPreviousData,
  });

  function applyProductionRow(row: ProductionSourceRow) {
    setSelectedPlanId(row.planId);
    setForm((prev) => ({
      ...prev,
      entryDate: row.entryDate.slice(0, 10),
      shiftId: row.shiftId,
      lineId: row.lineId,
      productId: row.productId,
      skuId: row.skuId,
      totalProduced: String(row.totalProduced || row.actualCases || 0),
    }));
  }

  // When date + shift selected, load production and auto-fill if only one work order
  useEffect(() => {
    if (editingId) return;
    const rows = productionSource.data?.rows ?? [];
    const key = `${form.entryDate}|${form.shiftId}|${form.lineId}`;
    if (!form.entryDate || !form.shiftId) {
      autoFilledKey.current = '';
      setSelectedPlanId('');
      return;
    }
    if (productionSource.isFetching) return;
    if (rows.length === 1 && autoFilledKey.current !== key) {
      autoFilledKey.current = key;
      applyProductionRow(rows[0]);
      return;
    }
    if (rows.length !== 1) {
      autoFilledKey.current = key;
      // Clear stale product/sku/produced when date/shift changed and multiple/none
      if (selectedPlanId && !rows.some((r) => r.planId === selectedPlanId)) {
        setSelectedPlanId('');
      }
    }
  }, [
    editingId,
    form.entryDate,
    form.shiftId,
    form.lineId,
    productionSource.data?.rows,
    productionSource.isFetching,
    selectedPlanId,
  ]);

  const PACK_VOLUME_ORDER = ['200 ML', '250 ML', '300 ML', '500 ML', '750 ML', '1000 ML', '2000 ML', 'Jar-20L'];

  const skuOptions = useMemo(() => {
    const all = skus.data ?? [];
    const pool = form.productId ? all.filter((s) => s.productId === form.productId) : all;
    const source = pool.length > 0 ? pool : all;

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

    const byLabel = new Map<string, { id: string; label: string; productId: string }>();

    const pick = (label: string) => {
      const code = catalogCode[label];
      return (
        source.find((s) => s.code === code) ||
        source.find((s) => (s.packVolume || '').toUpperCase() === label.toUpperCase()) ||
        source.find((s) => (s.name || '').toUpperCase() === label.toUpperCase()) ||
        all.find((s) => s.code === code) ||
        all.find((s) => (s.packVolume || '').toUpperCase() === label.toUpperCase())
      );
    };

    for (const label of PACK_VOLUME_ORDER) {
      const found = pick(label);
      if (found) byLabel.set(label.toUpperCase(), { id: found.id, label, productId: found.productId });
    }

    for (const s of source) {
      const label = (s.packVolume || s.name || s.code || '').trim();
      if (!label) continue;
      const key = label.toUpperCase();
      if (byLabel.has(key)) continue;
      byLabel.set(key, { id: s.id, label, productId: s.productId });
    }

    const ordered: Array<{ id: string; label: string; productId: string }> = [];
    for (const label of PACK_VOLUME_ORDER) {
      const row = byLabel.get(label.toUpperCase());
      if (row) {
        ordered.push(row);
        byLabel.delete(label.toUpperCase());
      }
    }
    for (const row of byLabel.values()) ordered.push(row);
    return ordered;
  }, [skus.data, form.productId]);

  const areaList = areas.data ?? [];

  const computed = useMemo(() => {
    const produced = Number(form.totalProduced) || 0;
    let totalReject = 0;
    if (showTypes) {
      for (const a of areaList) {
        for (const t of a.types) totalReject += Number(typeQty[t.id] || 0) || 0;
      }
    } else {
      for (const a of areaList) totalReject += Number(areaQty[a.id] || 0) || 0;
    }
    const ftg = Math.max(0, produced - totalReject);
    const rft = produced > 0 ? Number(((ftg / produced) * 100).toFixed(2)) : null;
    return { produced, totalReject, ftg, rft };
  }, [form.totalProduced, areaQty, typeQty, areaList, showTypes]);

  function resetForm() {
    setEditingId(null);
    setSelectedPlanId('');
    autoFilledKey.current = '';
    setForm({
      entryDate: localYmd(),
      lineId: '',
      shiftId: '',
      productId: '',
      skuId: '',
      totalProduced: '',
      remarks: '',
    });
    setAreaQty({});
    setTypeQty({});
  }

  function startEdit(row: RftRow) {
    setEditingId(row.id);
    setSelectedPlanId('');
    autoFilledKey.current = '';
    setForm({
      entryDate: row.entryDate.slice(0, 10),
      lineId: row.lineId,
      shiftId: row.shiftId,
      productId: row.productId,
      skuId: row.skuId,
      totalProduced: String(row.totalProduced),
      remarks: row.remarks || '',
    });
    const nextArea: Record<string, string> = {};
    const nextType: Record<string, string> = {};
    let hasType = false;
    for (const r of row.rejects) {
      if (r.rejectTypeId) {
        hasType = true;
        nextType[r.rejectTypeId] = String(r.quantity);
      } else {
        nextArea[r.areaId] = String((Number(nextArea[r.areaId] || 0) || 0) + r.quantity);
      }
    }
    // roll type sums into area display when not in type mode
    if (hasType) {
      for (const a of areaList) {
        const sum = a.types.reduce((s, t) => s + (Number(nextType[t.id] || 0) || 0), 0);
        if (sum > 0) nextArea[a.id] = String(sum);
      }
    }
    setAreaQty(nextArea);
    setTypeQty(nextType);
    setShowTypes(hasType);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!form.lineId || !form.shiftId || !form.productId || !form.skuId) {
        throw new Error('Select line, shift, product and SKU');
      }
      const produced = Number(form.totalProduced);
      if (!(produced >= 0)) throw new Error('Enter total produced');

      const rejects: Array<{ areaId: string; rejectTypeId?: string | null; quantity: number }> = [];
      if (showTypes) {
        for (const a of areaList) {
          for (const t of a.types) {
            const q = Number(typeQty[t.id] || 0) || 0;
            if (q > 0) rejects.push({ areaId: a.id, rejectTypeId: t.id, quantity: q });
          }
        }
      } else {
        for (const a of areaList) {
          const q = Number(areaQty[a.id] || 0) || 0;
          if (q > 0) rejects.push({ areaId: a.id, rejectTypeId: null, quantity: q });
        }
      }
      const totalReject = rejects.reduce((s, r) => s + r.quantity, 0);
      if (totalReject > produced) throw new Error('Total reject cannot exceed total produced');

      const payload = {
        entryDate: form.entryDate,
        lineId: form.lineId,
        shiftId: form.shiftId,
        productId: form.productId,
        skuId: form.skuId,
        totalProduced: produced,
        remarks: form.remarks || null,
        rejects,
      };
      if (editingId) return api.patch(`/rft-entries/${editingId}`, payload);
      return api.post('/rft-entries', payload);
    },
    onSuccess: async () => {
      toast.success(editingId ? 'RFT entry updated' : 'RFT entry saved');
      resetForm();
      await qc.invalidateQueries({ queryKey: ['rft-entries'] });
      await qc.invalidateQueries({ queryKey: ['rft-dashboard'] });
    },
    onError: (e: unknown) =>
      toast.error(
        (e as { response?: { data?: { error?: { message?: string } } }; message?: string })?.response?.data?.error
          ?.message ||
          (e as { message?: string })?.message ||
          'Save failed',
      ),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/rft-entries/${id}`),
    onSuccess: async () => {
      toast.success('RFT entry deleted');
      if (editingId) resetForm();
      await qc.invalidateQueries({ queryKey: ['rft-entries'] });
      await qc.invalidateQueries({ queryKey: ['rft-dashboard'] });
    },
    onError: () => toast.error('Delete failed'),
  });

  if (areas.isLoading || lines.isLoading || shifts.isLoading || products.isLoading || skus.isLoading) {
    return (
      <div>
        <PageHeader title="RFT Entries" subtitle="Area-wise reject quantity for Right First Time" />
        <LoadingBlock />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="RFT Entries"
        subtitle="Capture reject qty by area — First Time Good = Produced − Total Reject"
      />

      <div className="panel mb-5 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{editingId ? 'Edit RFT entry' : 'New RFT entry'}</h3>
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
            <input type="checkbox" checked={showTypes} onChange={(e) => setShowTypes(e.target.checked)} />
            Break down by reject type
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Field label="Date" className="mb-0">
            <input
              className="input"
              type="date"
              value={form.entryDate}
              max={localYmd()}
              onChange={(e) => {
                autoFilledKey.current = '';
                setSelectedPlanId('');
                setForm({
                  ...form,
                  entryDate: e.target.value,
                  lineId: '',
                  productId: '',
                  skuId: '',
                  totalProduced: '',
                });
              }}
            />
          </Field>
          <Field label="Shift" className="mb-0">
            <select
              className="input"
              value={form.shiftId}
              onChange={(e) => {
                autoFilledKey.current = '';
                setSelectedPlanId('');
                setForm({
                  ...form,
                  shiftId: e.target.value,
                  lineId: '',
                  productId: '',
                  skuId: '',
                  totalProduced: '',
                });
              }}
            >
              <option value="">Select…</option>
              {(shifts.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Line" className="mb-0">
            <select
              className="input"
              value={form.lineId}
              onChange={(e) => {
                autoFilledKey.current = '';
                setSelectedPlanId('');
                setForm({
                  ...form,
                  lineId: e.target.value,
                  productId: '',
                  skuId: '',
                  totalProduced: '',
                });
              }}
            >
              <option value="">Select…</option>
              {(lines.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code || l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Product" className="mb-0">
            <select
              className="input"
              value={form.productId}
              onChange={(e) => setForm({ ...form, productId: e.target.value, skuId: '' })}
            >
              <option value="">Select…</option>
              {(products.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="SKU" className="mb-0">
            <select
              className="input"
              value={form.skuId}
              onChange={(e) => {
                const skuId = e.target.value;
                const sku = skuOptions.find((s) => s.id === skuId) || (skus.data ?? []).find((s) => s.id === skuId);
                setForm({
                  ...form,
                  skuId,
                  ...(sku && 'productId' in sku && sku.productId && !form.productId
                    ? { productId: sku.productId }
                    : {}),
                });
              }}
            >
              <option value="">Select…</option>
              {skuOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Total Produced" className="mb-0">
            <input
              className="input"
              type="number"
              min={0}
              value={form.totalProduced}
              onChange={(e) => setForm({ ...form, totalProduced: e.target.value })}
            />
          </Field>
        </div>

        {!editingId && form.entryDate && form.shiftId ? (
          <div className="mt-4 rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-2, #f8fafc)' }}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                Shift production (from Production Entries)
              </h4>
              {productionSource.isFetching ? (
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  Loading…
                </span>
              ) : null}
            </div>
            {productionSource.isError ? (
              <p className="text-sm" style={{ color: 'var(--danger)' }}>
                Could not load production for this date/shift.
              </p>
            ) : (productionSource.data?.rows.length ?? 0) === 0 ? (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                No work orders / hourly production found for this date and shift. Enter details manually, or capture
                production first.
              </p>
            ) : (
              <div className="table-wrap overflow-x-auto">
                <table className="data text-sm">
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th>Line</th>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Actual</th>
                      <th>Good</th>
                      <th>Reject</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(productionSource.data?.rows ?? []).map((row) => (
                      <tr
                        key={row.planId}
                        className={selectedPlanId === row.planId ? 'font-medium' : undefined}
                        style={
                          selectedPlanId === row.planId
                            ? { background: 'color-mix(in srgb, var(--primary, #2563eb) 8%, transparent)' }
                            : undefined
                        }
                      >
                        <td>{row.planNumber}</td>
                        <td>{row.lineCode}</td>
                        <td>{row.productName}</td>
                        <td>{row.skuLabel}</td>
                        <td className="tabular-nums">{row.actualCases.toLocaleString()}</td>
                        <td className="tabular-nums">{row.goodCases.toLocaleString()}</td>
                        <td className="tabular-nums">{row.rejectCases.toLocaleString()}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-secondary px-2 py-1 text-xs"
                            onClick={() => applyProductionRow(row)}
                          >
                            {selectedPlanId === row.planId ? 'Selected' : 'Use'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                  Select a row to fill Line, Product, SKU and Total Produced (actual cases). Then enter area-wise rejects.
                </p>
              </div>
            )}
          </div>
        ) : null}

        <div className="mt-4 rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
            Area-wise reject quantity
          </h4>
          {!showTypes ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {areaList.map((a) => (
                <Field key={a.id} label={`${a.shortLabel} Reject`} className="mb-0">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={areaQty[a.id] || ''}
                    onChange={(e) => setAreaQty({ ...areaQty, [a.id]: e.target.value })}
                  />
                </Field>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {areaList.map((a) => (
                <div key={a.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                  <div className="mb-2 font-medium">{a.name}</div>
                  <div className="grid gap-2">
                    {a.types.map((t) => (
                      <Field key={t.id} label={t.example ? `${t.name} (${t.example})` : t.name} className="mb-0">
                        <input
                          className="input"
                          type="number"
                          min={0}
                          value={typeQty[t.id] || ''}
                          onChange={(e) => setTypeQty({ ...typeQty, [t.id]: e.target.value })}
                        />
                      </Field>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total Reject" value={computed.totalReject.toLocaleString()} tone="bad" />
          <KpiCard label="First Time Good" value={computed.ftg.toLocaleString()} tone="good" />
          <KpiCard
            label="RFT %"
            value={computed.rft == null ? '—' : `${computed.rft}%`}
            tone={computed.rft != null && computed.rft >= 98 ? 'good' : 'warn'}
          />
          <Field label="Remarks" className="mb-0">
            <input
              className="input"
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            />
          </Field>
        </div>

        <div className="mt-4 flex gap-2">
          <button className="btn btn-primary" type="button" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : editingId ? 'Update entry' : 'Save entry'}
          </button>
          {editingId ? (
            <button className="btn btn-secondary" type="button" onClick={resetForm}>
              Cancel
            </button>
          ) : null}
        </div>
      </div>

      <FilterBar columnsClassName="sm:grid-cols-2 lg:grid-cols-5">
        <FilterField label="From">
          <input className={FILTER_CTRL} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FilterField>
        <FilterField label="To">
          <input className={FILTER_CTRL} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </FilterField>
        <FilterField label="Line">
          <select className={FILTER_CTRL} value={filterLineId} onChange={(e) => setFilterLineId(e.target.value)}>
            <option value="">All lines</option>
            {(lines.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.code || l.name}
              </option>
            ))}
          </select>
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
        <FilterField label="This month">
          <button
            type="button"
            className={`${FILTER_CTRL} cursor-pointer px-3 font-medium`}
            onClick={() => {
              setFrom(monthStart());
              setTo(localYmd());
            }}
          >
            This month
          </button>
        </FilterField>
      </FilterBar>

      {entries.isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Date</th>
                <th>Shift</th>
                <th>Line</th>
                <th>Product</th>
                <th>Total Produced</th>
                {areaList.map((a) => (
                  <th key={a.id}>{a.shortLabel} Reject</th>
                ))}
                <th>Total Reject</th>
                <th>First Time Good</th>
                <th>RFT %</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(entries.data ?? []).map((r) => (
                <tr key={r.id} className={editingId === r.id ? 'row-editing' : undefined}>
                  <td>{fmtDate(r.entryDate)}</td>
                  <td>{r.shift.name}</td>
                  <td>{r.line.code || r.line.name}</td>
                  <td>
                    {r.product.brand?.name
                      ? `${r.product.brand.name} ${r.sku.packVolume || r.sku.name || ''}`.trim()
                      : r.product.name}
                  </td>
                  <td className="tabular-nums">{r.totalProduced.toLocaleString()}</td>
                  {areaList.map((a) => (
                    <td key={a.id} className="tabular-nums">
                      {(r.byArea[a.code] ?? 0).toLocaleString()}
                    </td>
                  ))}
                  <td className="tabular-nums font-medium" style={{ color: 'var(--danger)' }}>
                    {r.totalReject.toLocaleString()}
                  </td>
                  <td className="tabular-nums font-medium" style={{ color: 'var(--success)' }}>
                    {r.firstTimeGood.toLocaleString()}
                  </td>
                  <td className="tabular-nums font-semibold">
                    {r.rft == null ? '—' : `${r.rft}%`}
                  </td>
                  <td className="col-actions">
                    <div className="row-actions">
                      <IconButton title="Edit" primary type="button" onClick={() => startEdit(r)}>
                        <Pencil size={15} strokeWidth={1.75} />
                      </IconButton>
                      <IconButton
                        title="Delete"
                        danger
                        type="button"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (window.confirm('Delete this RFT entry?')) remove.mutate(r.id);
                        }}
                      >
                        <Trash2 size={15} strokeWidth={1.75} />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
              {(entries.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={10 + areaList.length} style={{ color: 'var(--muted)' }}>
                    No RFT entries in this range. Add one above.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
