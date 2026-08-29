import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
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
import { ChartCard, Field, KpiCard, LoadingBlock, PageHeader } from '../components/ui';

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
  paymentMode?: string;
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
  const [from, setFrom] = useState(() => monthStart());
  const [to, setTo] = useState(() => today());
  const [channel, setChannel] = useState('');
  const [downloading, setDownloading] = useState(false);
  const rangeValid = Boolean(from && to && from <= to);

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
          <div className="flex flex-wrap items-center gap-2">
            <Link className="btn btn-secondary" to="/sales-entries">
              Sales Entries
            </Link>
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
          </div>
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
                <th>Payment</th>
                <th>Cases</th>
                <th>Price</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center" style={{ color: 'var(--muted)' }}>
                    No sales in this range.{' '}
                    <Link className="underline" to="/sales-entries">
                      Record a day-wise sale
                    </Link>
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
                    <td>{r.paymentMode || '—'}</td>
                    <td className="tabular-nums">{r.casesSold}</td>
                    <td className="tabular-nums">₹{fmtMoney(r.unitPrice)}</td>
                    <td className="tabular-nums">₹{fmtMoney(r.amount)}</td>
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
