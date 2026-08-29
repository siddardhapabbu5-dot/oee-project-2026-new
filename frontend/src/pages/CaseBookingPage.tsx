import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { type ApiResponse } from '../lib/api';
import { FilterBar, FilterField, FILTER_CTRL } from '../components/FilterBar';
import { Badge, Field, IconButton, KpiCard, LoadingBlock, PageHeader } from '../components/ui';
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
type Distributor = { id: string; name: string; phone?: string | null; area?: string | null };

type BookingRow = {
  id: string;
  bookingDate: string;
  deliveryDate: string;
  customerName?: string | null;
  distributor?: { id: string; name: string } | null;
  casesBooked: number;
  unitPrice: number;
  amount: number;
  status: 'BOOKED' | 'DELIVERED' | 'CANCELLED';
  remarks?: string | null;
  brand?: { name: string } | null;
  product: { name: string };
  sku: { code: string; packVolume?: string | null };
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

const STATUS_FILTERS = [
  { value: '', label: 'All status' },
  { value: 'BOOKED', label: 'Booked' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;

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

function apiError(err: unknown, fallback: string) {
  return (
    (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ||
    (err as Error).message ||
    fallback
  );
}

function statusTone(status: BookingRow['status']): 'default' | 'good' | 'warn' | 'bad' {
  if (status === 'DELIVERED') return 'good';
  if (status === 'CANCELLED') return 'bad';
  return 'warn';
}

export default function CaseBookingPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'PRODUCTION_MANAGER';

  const [from, setFrom] = useState(() => monthStart());
  const [to, setTo] = useState(() => today());
  const [status, setStatus] = useState('');
  const [bookingDate, setBookingDate] = useState(() => today());
  const [deliveryDate, setDeliveryDate] = useState(() => today());

  const [form, setForm] = useState({
    productId: '',
    skuId: '',
    distributorId: '',
    customerName: '',
    casesBooked: '',
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

  const bookings = useQuery({
    queryKey: ['case-bookings', rangeFrom, rangeTo, status],
    queryFn: async () =>
      (
        await api.get<ApiResponse<BookingRow[]>>('/case-bookings', {
          params: {
            from: rangeFrom,
            to: rangeTo,
            ...(status ? { status } : {}),
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

  const rows = bookings.data ?? [];
  const openRows = rows.filter((r) => r.status === 'BOOKED');
  const openCases = openRows.reduce((sum, r) => sum + (Number(r.casesBooked) || 0), 0);
  const deliveredCases = rows
    .filter((r) => r.status === 'DELIVERED')
    .reduce((sum, r) => sum + (Number(r.casesBooked) || 0), 0);

  const save = useMutation({
    mutationFn: async () => {
      const casesBooked = Number(form.casesBooked);
      const unitPrice = Number(form.unitPrice) || 0;
      if (!form.productId || !form.skuId) throw new Error('Select product and SKU');
      if (!casesBooked || casesBooked <= 0) throw new Error('Enter cases to book');
      const typed = form.customerName.trim();
      const matched = matchDistributor(distributors.data ?? [], typed);
      await api.post('/case-bookings', {
        bookingDate,
        deliveryDate,
        productId: form.productId,
        skuId: form.skuId,
        distributorId: matched?.id || null,
        customerName: typed || matched?.name || null,
        casesBooked,
        unitPrice,
        remarks: form.remarks || null,
      });
    },
    onSuccess: async () => {
      toast.success('Cases booked');
      setForm((f) => ({
        ...f,
        skuId: '',
        distributorId: '',
        customerName: '',
        casesBooked: '',
        unitPrice: '',
        remarks: '',
      }));
      await qc.invalidateQueries({ queryKey: ['case-bookings'] });
    },
    onError: (err: unknown) => toast.error(apiError(err, 'Could not save booking')),
  });

  const deliver = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/case-bookings/${id}/deliver`);
    },
    onSuccess: async () => {
      toast.success('Marked delivered — sale recorded as Advance');
      await qc.invalidateQueries({ queryKey: ['case-bookings'] });
      await qc.invalidateQueries({ queryKey: ['sales-entries'] });
      await qc.invalidateQueries({ queryKey: ['sales-dashboard'] });
    },
    onError: (err: unknown) => toast.error(apiError(err, 'Could not deliver booking')),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/case-bookings/${id}/cancel`);
    },
    onSuccess: async () => {
      toast.success('Booking cancelled');
      await qc.invalidateQueries({ queryKey: ['case-bookings'] });
    },
    onError: (err: unknown) => toast.error(apiError(err, 'Could not cancel booking')),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/case-bookings/${id}`);
    },
    onSuccess: async () => {
      toast.success('Booking deleted');
      await qc.invalidateQueries({ queryKey: ['case-bookings'] });
    },
    onError: (err: unknown) => toast.error(apiError(err, 'Could not delete booking')),
  });

  return (
    <div>
      <PageHeader
        title="Advance Case Booking"
        subtitle="Book cases for a future delivery date — separate from day-book sales"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link className="btn btn-secondary" to="/sales-entries">
              Sales Entries
            </Link>
            <Link className="btn btn-secondary" to="/distributors">
              Distributors
            </Link>
          </div>
        }
      />

      <FilterBar columnsClassName="sm:grid-cols-2 lg:grid-cols-4">
        <FilterField label="From">
          <input
            className={FILTER_CTRL}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value || monthStart())}
          />
        </FilterField>
        <FilterField label="To">
          <input
            className={FILTER_CTRL}
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value || today())}
          />
        </FilterField>
        <FilterField label="Status">
          <select className={FILTER_CTRL} value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_FILTERS.map((s) => (
              <option key={s.value || 'all'} value={s.value}>
                {s.label}
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
          label="Open bookings"
          value={String(openRows.length)}
          icon={CalendarClock}
          hint={`${fmtDate(rangeFrom)} – ${fmtDate(rangeTo)}`}
        />
        <KpiCard label="Cases pending" value={fmtMoney(openCases)} />
        <KpiCard label="Cases delivered" value={fmtMoney(deliveredCases)} />
      </div>

      {canEdit ? (
        <div className="panel mb-4 p-4">
          <h3 className="mb-4 font-semibold">Book cases</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Booking date" className="mb-0">
              <input
                className="input w-full"
                type="date"
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value || today())}
              />
            </Field>
            <Field label="Delivery date" className="mb-0">
              <input
                className="input w-full"
                type="date"
                value={deliveryDate}
                min={bookingDate}
                onChange={(e) => setDeliveryDate(e.target.value || today())}
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
            <Field label="Distributor" className="mb-0">
              <input
                className="input w-full"
                list="booking-distributor-suggestions"
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
              <datalist id="booking-distributor-suggestions">
                {(distributors.data ?? []).map((d) => (
                  <option key={d.id} value={distributorLabel(d)} />
                ))}
              </datalist>
            </Field>
            <Field label="Cases booked" className="mb-0">
              <input
                className="input w-full"
                type="number"
                min={0}
                value={form.casesBooked}
                onChange={(e) => setForm({ ...form, casesBooked: e.target.value })}
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
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn btn-primary" type="button" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : 'Save booking'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="panel p-4">
        <h3 className="mb-3 font-semibold">
          {fmtDate(rangeFrom)} – {fmtDate(rangeTo)} — {rows.length} {rows.length === 1 ? 'booking' : 'bookings'}
        </h3>
        {bookings.isLoading && !bookings.data ? (
          <LoadingBlock />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Booked</th>
                  <th>Delivery</th>
                  <th>Brand</th>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Distributor</th>
                  <th>Cases</th>
                  <th>Amount</th>
                  <th>Status</th>
                  {canEdit ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 10 : 9} className="py-8 text-center" style={{ color: 'var(--muted)' }}>
                      No advance bookings for this period.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td>{fmtDate(r.bookingDate)}</td>
                      <td>{fmtDate(r.deliveryDate)}</td>
                      <td>{r.brand?.name || '—'}</td>
                      <td>{r.product.name}</td>
                      <td>{r.sku.packVolume || r.sku.code}</td>
                      <td>{r.distributor?.name || r.customerName || '—'}</td>
                      <td className="tabular-nums">{r.casesBooked}</td>
                      <td className="tabular-nums">₹{fmtMoney(r.amount)}</td>
                      <td>
                        <Badge tone={statusTone(r.status)}>
                          {r.status === 'BOOKED' ? 'Booked' : r.status === 'DELIVERED' ? 'Delivered' : 'Cancelled'}
                        </Badge>
                      </td>
                      {canEdit ? (
                        <td>
                          <div className="flex flex-wrap items-center gap-1">
                            {r.status === 'BOOKED' ? (
                              <>
                                <button
                                  className="btn btn-secondary"
                                  type="button"
                                  disabled={deliver.isPending}
                                  onClick={() => {
                                    if (window.confirm('Mark delivered and record as Advance sale?')) {
                                      deliver.mutate(r.id);
                                    }
                                  }}
                                >
                                  Deliver
                                </button>
                                <button
                                  className="btn btn-secondary"
                                  type="button"
                                  disabled={cancel.isPending}
                                  onClick={() => {
                                    if (window.confirm('Cancel this booking?')) cancel.mutate(r.id);
                                  }}
                                >
                                  Cancel
                                </button>
                              </>
                            ) : null}
                            {r.status !== 'DELIVERED' ? (
                              <IconButton
                                title="Delete"
                                danger
                                type="button"
                                onClick={() => {
                                  if (window.confirm('Delete this booking?')) remove.mutate(r.id);
                                }}
                              >
                                ×
                              </IconButton>
                            ) : null}
                          </div>
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
