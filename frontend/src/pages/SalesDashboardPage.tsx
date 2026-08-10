import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  Boxes,
  FileSpreadsheet,
  FilterX,
  IndianRupee,
  ShoppingCart,
  TrendingUp,
  FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import api, { type ApiResponse } from '../lib/api';
import { ChartValueLabels } from '../components/chartLabels';
import { ChartCard, Field, IconButton, KpiCard, LoadingBlock, PageHeader } from '../components/ui';
import { useAuthStore } from '../store';

type SalesKpis = {
  totalCases: number;
  totalAmount: number;
  invoiceCount: number;
  entryCount: number;
  avgDailyCases: number;
  avgDailyAmount: number;
  avgUnitPrice: number;
  prevCases: number;
  prevAmount: number;
  casesGrowth: number;
  amountGrowth: number;
};

type SalesCharts = {
  dailyTrend: Array<{ date: string; cases: number; amount: number }>;
  byBrand: Array<{ name: string; cases: number; amount: number }>;
  bySku: Array<{ name: string; cases: number; amount: number }>;
  byChannel: Array<{ name: string; cases: number; amount: number }>;
  byProduct: Array<{ name: string; cases: number; amount: number }>;
};

type SalesRow = {
  id: string;
  saleDate: string;
  plant: string;
  brand: string;
  product: string;
  sku: string;
  channel: string;
  customerName: string;
  invoiceNo: string;
  casesSold: number;
  unitPrice: number;
  amount: number;
};

type SalesPayload = {
  from: string;
  to: string;
  kpis: SalesKpis;
  charts: SalesCharts;
  recent: SalesRow[];
};

type Product = { id: string; name: string; brandId?: string | null };
type Sku = { id: string; code: string; name: string; productId: string; packVolume?: string | null };

const CHANNELS = [
  { value: '', label: 'All channels' },
  { value: 'DISTRIBUTOR', label: 'Distributor' },
  { value: 'RETAIL', label: 'Retail' },
  { value: 'MODERN_TRADE', label: 'Modern Trade' },
  { value: 'EXPORT', label: 'Export' },
  { value: 'OTHER', label: 'Other' },
] as const;

const PIE_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--pillar-availability)',
  'var(--pillar-performance)',
];

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

function fmtMoney(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function fmtAxisDate(iso: string) {
  if (!iso || iso.length < 10) return iso;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function growthTone(n: number): 'good' | 'warn' | 'bad' | 'default' {
  if (n > 0) return 'good';
  if (n < 0) return 'bad';
  return 'default';
}

export default function SalesDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'PRODUCTION_MANAGER';

  const [from, setFrom] = useState(() => monthStart());
  const [to, setTo] = useState(() => today());
  const [channel, setChannel] = useState('');
  const [downloading, setDownloading] = useState(false);
  const rangeValid = Boolean(from && to && from <= to);

  const [form, setForm] = useState({
    saleDate: today(),
    productId: '',
    skuId: '',
    channel: 'DISTRIBUTOR',
    customerName: '',
    invoiceNo: '',
    casesSold: '',
    unitPrice: '',
    remarks: '',
  });

  const clearFilters = () => {
    setFrom(monthStart());
    setTo(today());
    setChannel('');
  };

  async function downloadExcel() {
    if (!rangeValid || downloading) return;
    setDownloading(true);
    try {
      const res = await api.get('/dashboard/sales/export/excel', {
        responseType: 'blob',
        params: {
          from,
          to,
          ...(channel ? { channel } : {}),
        },
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sales-${from}_${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel downloaded');
    } catch {
      toast.error('Excel download failed');
    } finally {
      setDownloading(false);
    }
  }

  const products = useQuery({
    queryKey: ['products-sales'],
    queryFn: async () =>
      (await api.get<ApiResponse<Product[]>>('/products', { params: { limit: 200 } })).data.data,
    staleTime: 300_000,
  });

  const skus = useQuery({
    queryKey: ['skus-sales'],
    queryFn: async () =>
      (await api.get<ApiResponse<Sku[]>>('/skus', { params: { limit: 500 } })).data.data,
    staleTime: 300_000,
  });

  const summary = useQuery({
    queryKey: ['sales-dashboard', from, to, channel],
    enabled: rangeValid,
    queryFn: async () =>
      (
        await api.get<ApiResponse<SalesPayload>>('/dashboard/sales', {
          params: { from, to, ...(channel ? { channel } : {}) },
        })
      ).data.data,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const productSkus = useMemo(
    () => (skus.data ?? []).filter((s) => s.productId === form.productId),
    [skus.data, form.productId],
  );

  const save = useMutation({
    mutationFn: async () => {
      const casesSold = Number(form.casesSold);
      const unitPrice = Number(form.unitPrice) || 0;
      if (!form.productId || !form.skuId) throw new Error('Select product and SKU');
      if (!casesSold || casesSold <= 0) throw new Error('Enter cases sold');
      await api.post('/sales-entries', {
        saleDate: form.saleDate,
        productId: form.productId,
        skuId: form.skuId,
        channel: form.channel,
        customerName: form.customerName || null,
        invoiceNo: form.invoiceNo || null,
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
        customerName: '',
        invoiceNo: '',
        casesSold: '',
        unitPrice: '',
        remarks: '',
      }));
      await qc.invalidateQueries({ queryKey: ['sales-dashboard'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to save sale'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/sales-entries/${id}`);
    },
    onSuccess: async () => {
      toast.success('Sale removed');
      await qc.invalidateQueries({ queryKey: ['sales-dashboard'] });
    },
    onError: () => toast.error('Failed to delete'),
  });

  if (!rangeValid) {
    return (
      <div>
        <PageHeader title="Sales Dashboard" subtitle="Cases, revenue, brand & channel performance" />
        <div className="panel mb-4 p-4">
          <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <Field label="From Date" className="mb-0">
              <input className="input box-border h-10" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To Date" className="mb-0">
              <input className="input box-border h-10" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
        </div>
        <div className="panel p-6 text-sm" style={{ color: 'var(--danger)' }}>
          From date must be on or before To date.
        </div>
      </div>
    );
  }

  if (summary.isLoading && !summary.data) return <LoadingBlock />;
  if (summary.isError) {
    return (
      <div>
        <PageHeader title="Sales Dashboard" subtitle="Cases, revenue, brand & channel performance" />
        <div className="panel p-6 text-sm" style={{ color: 'var(--danger)' }}>
          Could not load sales dashboard. Check that the API and PostgreSQL are running, then refresh.
          <div className="mt-3">
            <button className="btn btn-secondary" type="button" onClick={() => void summary.refetch()}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (!summary.data) return <LoadingBlock />;

  const k = summary.data.kpis;
  const c = summary.data.charts;
  const recent = summary.data.recent;

  return (
    <div>
      <PageHeader
        title="Sales Dashboard"
        subtitle="Cases, revenue, brand & channel performance"
        actions={
          <button
            className="btn btn-secondary inline-flex items-center gap-2"
            type="button"
            disabled={downloading}
            onClick={() => void downloadExcel()}
            title="Download Excel"
          >
            <FileSpreadsheet size={16} strokeWidth={1.75} />
            {downloading ? 'Downloading…' : 'Download Excel'}
          </button>
        }
      />

      <div className="panel mb-4 p-4">
        <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <Field label="From Date" className="mb-0">
            <input
              className="input box-border h-10"
              type="date"
              value={from}
              max={today()}
              onChange={(e) => {
                const v = e.target.value;
                setFrom(v);
                if (to && v > to) setTo(v);
              }}
            />
          </Field>
          <Field label="To Date" className="mb-0">
            <input
              className="input box-border h-10"
              type="date"
              value={to}
              max={today()}
              onChange={(e) => {
                const v = e.target.value;
                setTo(v);
                if (from && v < from) setFrom(v);
              }}
            />
          </Field>
          <Field label="Channel" className="mb-0">
            <select
              className="input box-border h-10 min-w-[10rem]"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              {CHANNELS.map((ch) => (
                <option key={ch.value || 'all'} value={ch.value}>
                  {ch.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Clear" className="mb-0 w-10">
            <button
              type="button"
              className="input box-border inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center px-0"
              onClick={clearFilters}
              title="Reset to month start → today"
              aria-label="Clear filters"
            >
              <FilterX size={18} strokeWidth={1.75} />
            </button>
          </Field>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiCard
          label="Total Cases"
          value={fmtMoney(k.totalCases)}
          icon={Boxes}
          hint={`${k.casesGrowth >= 0 ? '+' : ''}${k.casesGrowth}% vs prior period`}
          tone={growthTone(k.casesGrowth)}
        />
        <KpiCard
          label="Revenue (₹)"
          value={fmtMoney(k.totalAmount)}
          icon={IndianRupee}
          hint={`${k.amountGrowth >= 0 ? '+' : ''}${k.amountGrowth}% vs prior period`}
          tone={growthTone(k.amountGrowth)}
        />
        <KpiCard label="Invoices" value={k.invoiceCount.toLocaleString()} icon={FileText} />
        <KpiCard label="Avg Daily Cases" value={fmtMoney(k.avgDailyCases)} icon={TrendingUp} />
        <KpiCard label="Avg Daily Revenue" value={`₹${fmtMoney(k.avgDailyAmount)}`} icon={Banknote} />
        <KpiCard label="Avg Price / Case" value={`₹${fmtMoney(k.avgUnitPrice)}`} icon={ShoppingCart} />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <ChartCard title="Daily Sales Trend (Cases)">
          <ResponsiveContainer>
            <LineChart data={c.dailyTrend} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tickFormatter={fmtAxisDate} tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fill: '#64748b' }} />
              <Tooltip labelFormatter={(v) => fmtAxisDate(String(v))} />
              <Legend />
              <Line type="monotone" dataKey="cases" name="Cases" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }}>
                <ChartValueLabels />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Daily Revenue Trend (₹)">
          <ResponsiveContainer>
            <LineChart data={c.dailyTrend} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tickFormatter={fmtAxisDate} tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fill: '#64748b' }} />
              <Tooltip
                labelFormatter={(v) => fmtAxisDate(String(v))}
                formatter={(v) => [`₹${fmtMoney(Number(v))}`, 'Revenue']}
              />
              <Legend />
              <Line type="monotone" dataKey="amount" name="Revenue" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3 }}>
                <ChartValueLabels />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <ChartCard title="Brand-wise Revenue">
          <ResponsiveContainer>
            <BarChart data={c.byBrand} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fill: '#64748b' }} />
              <Tooltip formatter={(v) => [`₹${fmtMoney(Number(v))}`, 'Revenue']} />
              <Bar dataKey="amount" name="Revenue" fill="var(--chart-1)" radius={[4, 4, 0, 0]}>
                <ChartValueLabels />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="SKU-wise Cases">
          <ResponsiveContainer>
            <BarChart data={c.bySku} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fill: '#64748b' }} />
              <Tooltip />
              <Bar dataKey="cases" name="Cases" fill="var(--chart-5)" radius={[4, 4, 0, 0]}>
                <ChartValueLabels />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Channel Mix">
          {c.byChannel.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
              No sales in this range
            </div>
          ) : (
            <ResponsiveContainer>
              <PieChart>
                <Pie data={c.byChannel} dataKey="amount" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  {c.byChannel.map((row, i) => (
                    <Cell key={row.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => [`₹${fmtMoney(Number(v))}`, 'Revenue']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {canEdit ? (
        <div className="panel mb-4 p-4">
          <h3 className="mb-4 font-semibold">Record Sale</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Date" className="mb-0">
              <input
                className="input w-full"
                type="date"
                value={form.saleDate}
                onChange={(e) => setForm({ ...form, saleDate: e.target.value })}
              />
            </Field>
            <Field label="Product" className="mb-0">
              <select
                className="input w-full"
                value={form.productId}
                onChange={(e) => setForm({ ...form, productId: e.target.value, skuId: '' })}
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
                <option value="">Select SKU...</option>
                {productSkus.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.packVolume || s.code}
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
            <Field label="Customer" className="mb-0">
              <input
                className="input w-full"
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                placeholder="Optional"
              />
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
          </div>
          <div className="mt-3 flex gap-2">
            <button
              className="btn btn-primary"
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? 'Saving…' : 'Save Sale'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="panel p-4">
        <h3 className="mb-3 font-semibold">Recent Sales ({recent.length})</h3>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Date</th>
                <th>Brand</th>
                <th>Product</th>
                <th>SKU</th>
                <th>Channel</th>
                <th>Customer</th>
                <th>Invoice</th>
                <th>Cases</th>
                <th>Price</th>
                <th>Amount</th>
                {canEdit ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 11 : 10} className="py-8 text-center" style={{ color: 'var(--muted)' }}>
                    No sales in this range. {canEdit ? 'Record a sale above or run seed-sales.' : ''}
                  </td>
                </tr>
              ) : (
                recent.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{r.saleDate}</td>
                    <td>{r.brand}</td>
                    <td>{r.product}</td>
                    <td>{r.sku}</td>
                    <td>{r.channel}</td>
                    <td>{r.customerName}</td>
                    <td>{r.invoiceNo}</td>
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
      </div>
    </div>
  );
}
