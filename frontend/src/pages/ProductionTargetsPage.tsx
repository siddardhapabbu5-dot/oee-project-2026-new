import { EmptyState, Field, IconButton, LoadingBlock, Modal, PageHeader, SortableTh } from '../components/ui';
import { Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { type ApiResponse } from '../lib/api';

type SkuRow = {
  id: string;
  code: string;
  name: string;
  productId: string;
  packVolume?: string | null;
  packSize?: number | null;
  bottlesPerHour?: number | null;
  casesPerHourTarget?: number | null;
  product?: { id: string; name: string } | null;
};

const DEFAULT_BOTTLES_PER_HOUR = 5400;
const PACK_VOLUMES = ['200 ML', '250 ML', '300 ML', '500 ML', '750 ML', '1000 ML', '2000 ML', 'Jar-20L'];

function packSizeFromVolume(volume?: string | null) {
  const v = (volume || '').toUpperCase().replace(/\s+/g, '');
  if (v.includes('200ML') || v === '200') return 36;
  if (v.includes('250ML') || v === '250') return 30;
  if (v.includes('300ML') || v === '300') return 24;
  if (v.includes('500ML') || v === '500') return 24;
  if (v.includes('750ML') || v === '750') return 12;
  if (v.includes('1000ML') || v.includes('1L') || v === '1000') return 12;
  if (v.includes('2000ML') || v.includes('2L') || v === '2000') return 6;
  if (v.includes('20L') || v.includes('JAR')) return 1;
  return null;
}

function resolveBottlesPerHour(value?: number | null) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_BOTTLES_PER_HOUR;
}

function resolvePackSize(row: Pick<SkuRow, 'packSize' | 'packVolume'>) {
  const n = Number(row.packSize);
  if (Number.isFinite(n) && n > 0) return n;
  return packSizeFromVolume(row.packVolume);
}

function calcCasesPerHour(bottlesPerHour?: number | null, bottlesPerCase?: number | null) {
  const bph = resolveBottlesPerHour(bottlesPerHour);
  const bpc = Number(bottlesPerCase);
  if (!Number.isFinite(bpc) || bpc <= 0) return null;
  return Math.round(bph / bpc);
}

const emptyForm = {
  code: '',
  name: '',
  productId: '',
  packVolume: '',
  packSize: '',
  bottlesPerHour: String(DEFAULT_BOTTLES_PER_HOUR),
};

type SortKey = 'code' | 'product' | 'packVolume' | 'packSize' | 'bottlesPerHour' | 'casesPerHour';
type SortDir = 'asc' | 'desc';

function rowCasesPerHour(row: SkuRow) {
  const bottlesPerCase = resolvePackSize(row);
  const bottlesPerHour = resolveBottlesPerHour(row.bottlesPerHour);
  if (row.casesPerHourTarget != null && row.casesPerHourTarget > 0) return row.casesPerHourTarget;
  return calcCasesPerHour(bottlesPerHour, bottlesPerCase);
}

export default function ProductionTargetsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('code');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SkuRow | null>(null);
  const [form, setForm] = useState(emptyForm);

  const products = useQuery({
    queryKey: ['products-options'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/products', { params: { limit: 100 } })).data
        .data,
  });

  const list = useQuery({
    queryKey: ['production-targets', search],
    queryFn: async () =>
      (await api.get<ApiResponse<SkuRow[]>>('/skus', { params: { search, limit: 200 } })).data.data,
  });

  const sortedRows = useMemo(() => {
    const enriched = (list.data ?? []).map((row) => {
      const bottlesPerCase = resolvePackSize(row);
      const bottlesPerHour = resolveBottlesPerHour(row.bottlesPerHour);
      const casesPerHour = rowCasesPerHour(row);
      return { row, bottlesPerCase, bottlesPerHour, casesPerHour };
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    return [...enriched].sort((a, b) => {
      const av =
        sortKey === 'code'
          ? a.row.code
          : sortKey === 'product'
            ? a.row.product?.name || ''
            : sortKey === 'packVolume'
              ? a.row.packVolume || ''
              : sortKey === 'packSize'
                ? a.bottlesPerCase ?? -1
                : sortKey === 'bottlesPerHour'
                  ? a.bottlesPerHour
                  : a.casesPerHour ?? -1;
      const bv =
        sortKey === 'code'
          ? b.row.code
          : sortKey === 'product'
            ? b.row.product?.name || ''
            : sortKey === 'packVolume'
              ? b.row.packVolume || ''
              : sortKey === 'packSize'
                ? b.bottlesPerCase ?? -1
                : sortKey === 'bottlesPerHour'
                  ? b.bottlesPerHour
                  : b.casesPerHour ?? -1;

      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' }) * dir;
    });
  }, [list.data, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'casesPerHour' || key === 'bottlesPerHour' || key === 'packSize' ? 'desc' : 'asc');
    }
  }

  const livePackSize = useMemo(() => {
    const typed = form.packSize !== '' ? Number(form.packSize) : NaN;
    if (Number.isFinite(typed) && typed > 0) return typed;
    return packSizeFromVolume(form.packVolume);
  }, [form.packSize, form.packVolume]);

  const liveBottlesPerHour = useMemo(() => {
    const typed = form.bottlesPerHour !== '' ? Number(form.bottlesPerHour) : NaN;
    return Number.isFinite(typed) && typed > 0 ? typed : DEFAULT_BOTTLES_PER_HOUR;
  }, [form.bottlesPerHour]);

  const liveCasesPerHour = useMemo(
    () => calcCasesPerHour(liveBottlesPerHour, livePackSize),
    [liveBottlesPerHour, livePackSize],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!form.code.trim()) throw new Error('SKU Code is required');
      if (!form.productId) throw new Error('Product is required');
      const packSize = livePackSize;
      const bottlesPerHour = liveBottlesPerHour;
      const payload = {
        code: form.code.trim(),
        name: form.name.trim() || form.packVolume || form.code.trim(),
        productId: form.productId,
        packVolume: form.packVolume || null,
        packSize: packSize && packSize > 0 ? packSize : null,
        bottlesPerHour,
        isActive: true,
      };
      if (editing) return api.patch(`/skus/${editing.id}`, payload);
      return api.post('/skus', payload);
    },
    onSuccess: async () => {
      toast.success(editing ? 'Target updated' : 'Target created');
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await qc.invalidateQueries({ queryKey: ['production-targets'] });
      await qc.invalidateQueries({ queryKey: ['/skus'] });
      await qc.invalidateQueries({ queryKey: ['skus'] });
    },
    onError: (err: unknown) => {
      toast.error(
        (err as { message?: string; response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ||
          (err as { message?: string })?.message ||
          'Save failed',
      );
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/skus/${id}`),
    onSuccess: async () => {
      toast.success('Deleted');
      await qc.invalidateQueries({ queryKey: ['production-targets'] });
      await qc.invalidateQueries({ queryKey: ['/skus'] });
      await qc.invalidateQueries({ queryKey: ['skus'] });
    },
    onError: () => toast.error('Delete failed'),
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(row: SkuRow) {
    setEditing(row);
    setForm({
      code: row.code || '',
      name: row.name || '',
      productId: row.productId || '',
      packVolume: row.packVolume || '',
      packSize: row.packSize != null ? String(row.packSize) : '',
      bottlesPerHour: String(resolveBottlesPerHour(row.bottlesPerHour)),
    });
    setOpen(true);
  }

  return (
    <div className="flex min-h-[calc(100dvh-5.75rem)] flex-col gap-3">
      <PageHeader
        title="Production Targets"
        subtitle="SKU-wise master — Bottles/Hour ÷ Bottles/Case = Cases/Hour Target"
        actions={
          <>
            <input
              className="input max-w-[14rem] sm:max-w-xs"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="btn btn-primary" type="button" onClick={openCreate}>
              Add New
            </button>
          </>
        }
      />

      {list.isLoading ? (
        <LoadingBlock />
      ) : sortedRows.length === 0 ? (
        <div className="panel p-6">
          <EmptyState message="No production targets found" />
        </div>
      ) : (
        <div className="table-wrap fit-view">
          <div className="table-scroll">
            <table className="data">
              <colgroup>
                <col style={{ width: '16%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '10%' }} />
              </colgroup>
              <thead>
                <tr>
                  <SortableTh label="SKU Code" active={sortKey === 'code'} direction={sortKey === 'code' ? sortDir : null} onClick={() => toggleSort('code')} />
                  <SortableTh label="Product" active={sortKey === 'product'} direction={sortKey === 'product' ? sortDir : null} onClick={() => toggleSort('product')} />
                  <SortableTh label="Pack Volume" active={sortKey === 'packVolume'} direction={sortKey === 'packVolume' ? sortDir : null} onClick={() => toggleSort('packVolume')} />
                  <SortableTh label="Bottles/Case" active={sortKey === 'packSize'} direction={sortKey === 'packSize' ? sortDir : null} onClick={() => toggleSort('packSize')} />
                  <SortableTh label="Bottles/Hour" active={sortKey === 'bottlesPerHour'} direction={sortKey === 'bottlesPerHour' ? sortDir : null} onClick={() => toggleSort('bottlesPerHour')} />
                  <SortableTh label="Cases/Hour Target" active={sortKey === 'casesPerHour'} direction={sortKey === 'casesPerHour' ? sortDir : null} onClick={() => toggleSort('casesPerHour')} />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map(({ row, bottlesPerCase, bottlesPerHour, casesPerHour }) => (
                  <tr key={row.id}>
                    <td className="font-medium" title={row.code}>{row.code}</td>
                    <td title={row.product?.name || ''}>{row.product?.name || '—'}</td>
                    <td>{row.packVolume || '—'}</td>
                    <td>{bottlesPerCase != null ? bottlesPerCase.toLocaleString() : '—'}</td>
                    <td>{bottlesPerHour.toLocaleString()}</td>
                    <td>
                      {casesPerHour != null ? (
                        <span className="font-semibold" style={{ color: 'var(--accent)' }}>
                          {casesPerHour.toLocaleString()} Cases
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <IconButton title="Edit" primary onClick={() => openEdit(row)}>
                          <Pencil size={16} strokeWidth={1.75} />
                        </IconButton>
                        <IconButton
                          title="Delete"
                          danger
                          onClick={() => {
                            if (window.confirm(`Delete ${row.code}?`)) remove.mutate(row.id);
                          }}
                        >
                          <Trash2 size={16} strokeWidth={1.75} />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={open}
        title={editing ? `Edit Target — ${editing.code}` : 'Add Production Target'}
        onClose={() => setOpen(false)}
      >
        <div className="grid gap-1 sm:grid-cols-2">
          <Field label="SKU Code">
            <input
              className="input"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </Field>
          <Field label="Product">
            <select
              className="input"
              value={form.productId}
              onChange={(e) => setForm({ ...form, productId: e.target.value })}
            >
              <option value="">Select...</option>
              {(products.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Display Name">
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Pack Volume">
            <select
              className="input"
              value={form.packVolume}
              onChange={(e) => {
                const packVolume = e.target.value;
                const auto = packSizeFromVolume(packVolume);
                setForm({
                  ...form,
                  packVolume,
                  packSize: auto != null ? String(auto) : form.packSize,
                });
              }}
            >
              <option value="">Select...</option>
              {PACK_VOLUMES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Bottles / Case">
            <input
              className="input"
              type="number"
              min={1}
              value={form.packSize}
              onChange={(e) => setForm({ ...form, packSize: e.target.value })}
            />
          </Field>
          <Field label="Bottles / Hour">
            <input
              className="input"
              type="number"
              min={1}
              value={form.bottlesPerHour}
              onChange={(e) => setForm({ ...form, bottlesPerHour: e.target.value })}
            />
          </Field>
        </div>

        <div
          className="mt-3 mb-4 rounded-[0.625rem] px-4 py-3 text-sm"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          <div className="font-medium">Cases / Hour Target</div>
          <div className="mt-1 text-2xl font-semibold" style={{ color: 'var(--text)' }}>
            {liveCasesPerHour != null ? `${liveCasesPerHour.toLocaleString()} Cases` : '—'}
          </div>
          <div className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
            {liveBottlesPerHour.toLocaleString()} bottles/hour ÷ {livePackSize ?? '—'} bottles/case
          </div>
        </div>

        <button className="btn btn-primary w-full" type="button" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving...' : 'Save'}
        </button>
      </Modal>
    </div>
  );
}
