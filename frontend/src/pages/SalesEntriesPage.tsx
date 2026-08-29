import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, ShoppingCart } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { type ApiResponse } from '../lib/api';
import { FilterBar, FilterField, FILTER_CTRL } from '../components/FilterBar';
import { Field, IconButton, KpiCard, LoadingBlock, PageHeader } from '../components/ui';
import { useAuthStore } from '../store';

type Product = { id: string; name: string };
type Sku = {
  id: string;
  code: string;
  name: string;
  productId: string;
  packVolume?: string | null;
  isActive?: boolean;
};

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
type Distributor = { id: string; name: string; phone?: string | null; area?: string | null };

type SalesEntryRow = {
  id: string;
  saleDate: string;
  channel: string;
  customerName?: string | null;
  distributor?: { id: string; name: string } | null;
  invoiceNo?: string | null;
  paymentMode?: string | null;
  casesSold: number;
  unitPrice: number;
  amount: number;
  remarks?: string | null;
  brand?: { name: string } | null;
  product: { name: string };
  sku: { code: string; packVolume?: string | null };
};

const CHANNELS = [
  { value: '', label: 'All channels' },
  { value: 'DISTRIBUTOR', label: 'Distributor' },
  { value: 'RETAIL', label: 'Retail' },
  { value: 'MODERN_TRADE', label: 'Modern Trade' },
  { value: 'EXPORT', label: 'Export' },
  { value: 'OTHER', label: 'Other' },
] as const;

const CHANNEL_LABEL: Record<string, string> = {
  DISTRIBUTOR: 'Distributor',
  RETAIL: 'Retail',
  MODERN_TRADE: 'Modern Trade',
  EXPORT: 'Export',
  OTHER: 'Other',
};

const PAYMENT_MODES = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CREDIT', label: 'Credit' },
  { value: 'ADVANCE', label: 'Advance' },
] as const;

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Cash',
  CREDIT: 'Credit',
  ADVANCE: 'Advance',
};

function localYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function today() {
  return localYmd(new Date());
}

function monthStart() {
  const d = new Date();
  return localYmd(new Date(d.getFullYear(), d.getMonth(), 1));
}

function fmtDate(iso: string) {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtMoney(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function distributorLabel(d: { name: string; area?: string | null }) {
  return d.area ? `${d.name} (${d.area})` : d.name;
}

function matchDistributor(list: Distributor[], typed: string) {
  const t = typed.trim().toLowerCase();
  if (!t) return undefined;
  return list.find((d) => {
    const label = distributorLabel(d).toLowerCase();
    return d.name.toLowerCase() === t || label === t;
  });
}

export default function SalesEntriesPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'PRODUCTION_MANAGER';

  const [from, setFrom] = useState(() => monthStart());
  const [to, setTo] = useState(() => today());
  const [saleDate, setSaleDate] = useState(() => today());
  const [channel, setChannel] = useState('');
  const [downloading, setDownloading] = useState(false);

  const [form, setForm] = useState({
    productId: '',
    skuId: '',
    channel: 'DISTRIBUTOR',
    distributorId: '',
    customerName: '',
    invoiceNo: '',
    paymentMode: 'CASH',
    casesSold: '',
    unitPrice: '',
    remarks: '',
  });

  const products = useQuery({
    queryKey: ['product-options'],
    enabled: canEdit,
    queryFn: async () =>
      (await api.get<ApiResponse<Product[]>>('/products/options')).data.data,
  });

  const skus = useQuery({
    queryKey: ['skus'],
    enabled: canEdit,
    queryFn: async () =>
      (await api.get<ApiResponse<Sku[]>>('/skus', { params: { limit: 500 } })).data.data,
  });

  const distributors = useQuery({
    queryKey: ['distributors-options'],
    enabled: canEdit,
    queryFn: async () =>
      (await api.get<ApiResponse<Distributor[]>>('/distributors', { params: { limit: 500 } })).data.data,
    staleTime: 300_000,
  });

  const rangeFrom = from <= to ? from : to;
  const rangeTo = from <= to ? to : from;

  const entries = useQuery({
    queryKey: ['sales-entries', rangeFrom, rangeTo, channel],
    queryFn: async () =>
      (
        await api.get<ApiResponse<SalesEntryRow[]>>('/sales-entries', {
          params: {
            from: rangeFrom,
            to: rangeTo,
            ...(channel ? { channel } : {}),
          },
        })
      ).data.data,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const catalogSkus = useMemo(() => {
    const all = (skus.data ?? []).filter((s) => s.isActive !== false);
    return PACK_VOLUME_ORDER.map((label) => {
      const code = CATALOG_SKU_CODES[label];
      const found =
        all.find((s) => s.code === code) ||
        all.find((s) => (s.packVolume || '').toUpperCase() === label.toUpperCase()) ||
        all.find((s) => (s.name || '').toUpperCase() === label.toUpperCase());
      return found ? { id: found.id, label } : null;
    }).filter(Boolean) as Array<{ id: string; label: string }>;
  }, [skus.data]);

  const allRows = entries.data ?? [];
  const rows = channel ? allRows.filter((r) => r.channel === channel) : allRows;
  const dayCases = rows.reduce((sum, r) => sum + (Number(r.casesSold) || 0), 0);
  const dayAmount = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const save = useMutation({
    mutationFn: async () => {
      const casesSold = Number(form.casesSold);
      const unitPrice = Number(form.unitPrice) || 0;
      if (!form.productId || !form.skuId) throw new Error('Select product and SKU');
      if (!casesSold || casesSold <= 0) throw new Error('Enter cases sold');
      const typed = form.customerName.trim();
      const matched = matchDistributor(distributors.data ?? [], typed);
      await api.post('/sales-entries', {
        saleDate,
        productId: form.productId,
        skuId: form.skuId,
        channel: form.channel,
        distributorId: matched?.id || null,
        customerName: typed || matched?.name || null,
        invoiceNo: form.invoiceNo || null,
        paymentMode: form.paymentMode,
        casesSold,
        unitPrice,
        remarks: form.remarks || null,
      });
    },
    onSuccess: async () => {
      toast.success('Sale recorded');
      setForm((f) => ({
        ...f,
        skuId: '',
        distributorId: '',
        customerName: '',
        invoiceNo: '',
        paymentMode: 'CASH',
        casesSold: '',
        unitPrice: '',
        remarks: '',
      }));
      await qc.invalidateQueries({ queryKey: ['sales-entries'] });
      await qc.invalidateQueries({ queryKey: ['sales-dashboard'] });
    },
    onError: (e: unknown) =>
      toast.error(
        (e as { response?: { data?: { error?: { message?: string } } }; message?: string })?.response?.data?.error
          ?.message || (e as Error).message || 'Failed to save sale',
      ),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/sales-entries/${id}`);
    },
    onSuccess: async () => {
      toast.success('Sale removed');
      await qc.invalidateQueries({ queryKey: ['sales-entries'] });
      await qc.invalidateQueries({ queryKey: ['sales-dashboard'] });
    },
    onError: () => toast.error('Failed to delete'),
  });

  async function downloadExcel() {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await api.get('/dashboard/sales/export/excel', {
        responseType: 'blob',
        params: {
          from: rangeFrom,
          to: rangeTo,
          ...(channel ? { channel } : {}),
        },
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sales-entries-${rangeFrom}-to-${rangeTo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel downloaded');
    } catch {
      toast.error('Excel download failed');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Sales Entries"
        subtitle="Day-wise sales recording — product, SKU, channel, cases and invoice"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link className="btn btn-secondary" to="/sales-dashboard">
              Sales Dashboard
            </Link>
            <Link className="btn btn-secondary" to="/distributors">
              Distributors
            </Link>
            <button
              className="btn btn-secondary inline-flex items-center gap-2"
              type="button"
              disabled={downloading || rows.length === 0}
              onClick={() => void downloadExcel()}
            >
              <FileSpreadsheet size={16} strokeWidth={1.75} />
              {downloading ? 'Downloading…' : 'Download Excel'}
            </button>
          </div>
        }
      />

      <FilterBar columnsClassName="sm:grid-cols-2 lg:grid-cols-4">
        <FilterField label="From">
          <input
            className={FILTER_CTRL}
            type="date"
            value={from}
            max={today()}
            onChange={(e) => setFrom(e.target.value || monthStart())}
          />
        </FilterField>
        <FilterField label="To">
          <input
            className={FILTER_CTRL}
            type="date"
            value={to}
            max={today()}
            min={from}
            onChange={(e) => setTo(e.target.value || today())}
          />
        </FilterField>
        <FilterField label="Channel">
          <select className={FILTER_CTRL} value={channel} onChange={(e) => setChannel(e.target.value)}>
            {CHANNELS.map((ch) => (
              <option key={ch.value || 'all'} value={ch.value}>
                {ch.label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="This month">
          <button
            className={`${FILTER_CTRL} cursor-pointer`}
            type="button"
            onClick={() => {
              setFrom(monthStart());
              setTo(today());
            }}
          >
            This month
          </button>
        </FilterField>
      </FilterBar>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="Entries"
          value={String(rows.length)}
          icon={ShoppingCart}
          hint={rangeFrom === rangeTo ? fmtDate(rangeFrom) : `${fmtDate(rangeFrom)} – ${fmtDate(rangeTo)}`}
        />
        <KpiCard label="Cases sold" value={fmtMoney(dayCases)} />
        <KpiCard label="Revenue (₹)" value={fmtMoney(dayAmount)} />
      </div>

      {canEdit ? (
        <div className="panel mb-4 p-4">
          <h3 className="mb-4 font-semibold">Record sale</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Sale date" className="mb-0">
              <input
                className="input w-full"
                type="date"
                value={saleDate}
                max={today()}
                onChange={(e) => setSaleDate(e.target.value || today())}
              />
            </Field>
            <Field label="Product" className="mb-0">
              <select
                className="input w-full"
                value={form.productId}
                onChange={(e) => setForm({ ...form, productId: e.target.value })}
              >
                <option value="">Select product...</option>
                {(products.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="SKU" className="mb-0">
              <select
                className="input w-full"
                value={form.skuId}
                onChange={(e) => setForm({ ...form, skuId: e.target.value })}
              >
                <option value="">Select...</option>
                {catalogSkus.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Channel" className="mb-0">
              <select
                className="input w-full"
                value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value })}
              >
                {CHANNELS.filter((ch) => ch.value).map((ch) => (
                  <option key={ch.value} value={ch.value}>
                    {ch.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Distributor" className="mb-0">
              <input
                className="input w-full"
                list="sale-distributor-suggestions"
                value={form.customerName}
                onChange={(e) => {
                  const name = e.target.value;
                  const matched = matchDistributor(distributors.data ?? [], name);
                  setForm({
                    ...form,
                    customerName: name,
                    distributorId: matched?.id || '',
                  });
                }}
                placeholder="Type name or pick from list"
                autoComplete="off"
              />
              <datalist id="sale-distributor-suggestions">
                {(distributors.data ?? []).map((d) => (
                  <option key={d.id} value={distributorLabel(d)} />
                ))}
              </datalist>
            </Field>
            <Field label="Invoice No." className="mb-0">
              <input
                className="input w-full"
                value={form.invoiceNo}
                onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })}
                placeholder="Optional"
              />
            </Field>
            <Field label="Cases Sold" className="mb-0">
              <input
                className="input w-full"
                type="number"
                min={0}
                value={form.casesSold}
                onChange={(e) => setForm({ ...form, casesSold: e.target.value })}
              />
            </Field>
            <Field label="Unit Price (₹)" className="mb-0">
              <input
                className="input w-full"
                type="number"
                min={0}
                value={form.unitPrice}
                onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
              />
            </Field>
            <Field label="Remarks" className="mb-0">
              <input
                className="input w-full"
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                placeholder="Optional"
              />
            </Field>
            <Field label="Payment mode" className="mb-0">
              <select
                className="input w-full"
                value={form.paymentMode}
                onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}
              >
                {PAYMENT_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn btn-primary" type="button" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : 'Save Sale'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="panel p-4">
        <h3 className="mb-3 font-semibold">
          {rangeFrom === rangeTo
            ? `${fmtDate(rangeFrom)} — ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`
            : `${fmtDate(rangeFrom)} – ${fmtDate(rangeTo)} — ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`}
        </h3>
        {entries.isLoading && !entries.data ? (
          <LoadingBlock />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Brand</th>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Channel</th>
                  <th>Distributor</th>
                  <th>Invoice</th>
                  <th>Payment</th>
                  <th>Cases</th>
                  <th>Price</th>
                  <th>Amount</th>
                  {canEdit ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 12 : 11} className="py-8 text-center" style={{ color: 'var(--muted)' }}>
                      No sales recorded for this period.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td>{fmtDate(r.saleDate)}</td>
                      <td>{r.brand?.name || '—'}</td>
                      <td>{r.product.name}</td>
                      <td>{r.sku.packVolume || r.sku.code}</td>
                      <td>{CHANNEL_LABEL[r.channel] || r.channel}</td>
                      <td>{r.distributor?.name || r.customerName || '—'}</td>
                      <td>{r.invoiceNo || '—'}</td>
                      <td>{PAYMENT_LABEL[r.paymentMode || ''] || r.paymentMode || '—'}</td>
                      <td className="tabular-nums">{r.casesSold}</td>
                      <td className="tabular-nums">₹{fmtMoney(r.unitPrice)}</td>
                      <td className="tabular-nums">₹{fmtMoney(r.amount)}</td>
                      {canEdit ? (
                        <td>
                          <IconButton
                            title="Delete"
                            danger
                            type="button"
                            onClick={() => {
                              if (window.confirm('Delete this sales entry?')) remove.mutate(r.id);
                            }}
                          >
                            ×
                          </IconButton>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
