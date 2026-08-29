import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, FileText, ImageIcon, Paperclip, Wallet, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { type ApiResponse } from '../lib/api';
import { FilterBar, FilterField, FILTER_CTRL } from '../components/FilterBar';
import { Field, IconButton, KpiCard, LoadingBlock, PageHeader } from '../components/ui';
import { useAuthStore } from '../store';

type PettyRow = {
  id: string;
  entryDate: string;
  voucherNo: string;
  category: string;
  description: string;
  received: number;
  paid: number;
  balance: number;
  approvedBy?: string | null;
  remarks?: string | null;
  hasAttachment?: boolean;
  attachmentName?: string | null;
};

type PettyPayload = {
  summary: {
    openingBalance: number;
    advances?: number;
    cashReceived: number;
    totalExpenses: number;
    closingCash: number;
  };
  categories: string[];
  items: PettyRow[];
};

const FALLBACK_CATEGORIES = [
  'Opening Balance',
  'Petty Cash Advance',
  'Tea & Refreshments',
  'Travel & Local Conveyance',
  'Fuel',
  'Stationery',
  'Repairs & Maintenance',
  'Packing Materials',
  'Cleaning Expenses',
  'Mobile & Internet',
  'Factory Expenses',
  'Miscellaneous',
];

const INFLOW_CATEGORIES = ['Opening Balance', 'Petty Cash Advance'];

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
  if (!n) return '—';
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function fmtBalance(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function VoucherAttach({
  file,
  onFile,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
}) {
  const photoRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file?.type.startsWith('image/')) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function clear() {
    onFile(null);
    if (photoRef.current) photoRef.current.value = '';
    if (pdfRef.current) pdfRef.current.value = '';
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--muted)' }}>
        Attach voucher
      </span>
      <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
        Optional — pick a photo of the bill, or a PDF.
      </p>
      <input
        ref={photoRef}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <input
        ref={pdfRef}
        className="sr-only"
        type="file"
        accept="application/pdf,.pdf"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-secondary" type="button" onClick={() => photoRef.current?.click()}>
          <ImageIcon size={16} strokeWidth={1.75} />
          Attach photo
        </button>
        <button className="btn btn-secondary" type="button" onClick={() => pdfRef.current?.click()}>
          <FileText size={16} strokeWidth={1.75} />
          Attach PDF
        </button>
        {file ? (
          <button className="btn btn-secondary" type="button" onClick={clear}>
            <X size={16} strokeWidth={1.75} />
            Remove
          </button>
        ) : null}
      </div>
      {file ? (
        <div className="mt-2 flex items-center gap-3 text-sm">
          {preview ? (
            <img
              src={preview}
              alt=""
              className="h-12 w-12 rounded-md object-cover"
              style={{ border: '1px solid var(--border)' }}
            />
          ) : (
            <span className="icon-box !h-10 !w-10">
              <FileText size={16} />
            </span>
          )}
          <span>{file.name}</span>
        </div>
      ) : (
        <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
          No file attached
        </p>
      )}
    </div>
  );
}

function monthLabel(ymd: string) {
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export default function PettyCashPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'PRODUCTION_MANAGER';

  const [from, setFrom] = useState(() => monthStart());
  const [to, setTo] = useState(() => today());
  const [category, setCategory] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [advanceFile, setAdvanceFile] = useState<File | null>(null);
  const [expenseFile, setExpenseFile] = useState<File | null>(null);

  const [advance, setAdvance] = useState({
    entryDate: today(),
    amount: '',
    approvedBy: '',
    remarks: '',
  });

  const [form, setForm] = useState({
    entryDate: today(),
    category: 'Tea & Refreshments',
    description: '',
    paid: '',
    approvedBy: '',
    remarks: '',
  });

  const rangeFrom = from <= to ? from : to;
  const rangeTo = from <= to ? to : from;

  const book = useQuery({
    queryKey: ['petty-cash', rangeFrom, rangeTo, category],
    queryFn: async () =>
      (
        await api.get<ApiResponse<PettyPayload>>('/petty-cash', {
          params: {
            from: rangeFrom,
            to: rangeTo,
            ...(category ? { category } : {}),
          },
        })
      ).data.data,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

  const categories = book.data?.categories?.length ? book.data.categories : FALLBACK_CATEGORIES;
  const expenseCategories = categories.filter((c) => !INFLOW_CATEGORIES.includes(c));
  const rows = book.data?.items ?? [];
  const s = book.data?.summary;

  const saveAdvance = useMutation({
    mutationFn: async () => {
      const amount = Number(advance.amount) || 0;
      if (amount <= 0) throw new Error('Enter the amount taken from the company');
      const fd = new FormData();
      fd.append('entryDate', advance.entryDate);
      fd.append('category', 'Petty Cash Advance');
      fd.append('description', `Petty cash from company — ${monthLabel(advance.entryDate)}`);
      fd.append('received', String(amount));
      fd.append('paid', '0');
      if (advance.approvedBy.trim()) fd.append('approvedBy', advance.approvedBy.trim());
      if (advance.remarks.trim()) fd.append('remarks', advance.remarks.trim());
      if (advanceFile) fd.append('attachment', advanceFile);
      await api.post('/petty-cash', fd);
    },
    onSuccess: async () => {
      toast.success('Petty cash from company recorded');
      setAdvance((a) => ({ ...a, amount: '', remarks: '' }));
      setAdvanceFile(null);
      await qc.invalidateQueries({ queryKey: ['petty-cash'] });
    },
    onError: (e: unknown) =>
      toast.error(
        (e as { response?: { data?: { error?: { message?: string } } }; message?: string })?.response?.data?.error
          ?.message || (e as Error).message || 'Failed to save advance',
      ),
  });

  const save = useMutation({
    mutationFn: async () => {
      const paid = Number(form.paid) || 0;
      if (!form.category) throw new Error('Select category');
      if (!form.description.trim()) throw new Error('Enter description');
      if (paid <= 0) throw new Error('Enter paid amount');
      const fd = new FormData();
      fd.append('entryDate', form.entryDate);
      fd.append('category', form.category);
      fd.append('description', form.description.trim());
      fd.append('received', '0');
      fd.append('paid', String(paid));
      if (form.approvedBy.trim()) fd.append('approvedBy', form.approvedBy.trim());
      if (form.remarks.trim()) fd.append('remarks', form.remarks.trim());
      if (expenseFile) fd.append('attachment', expenseFile);
      await api.post('/petty-cash', fd);
    },
    onSuccess: async () => {
      toast.success('Expense voucher saved');
      setForm((f) => ({
        ...f,
        description: '',
        paid: '',
        remarks: '',
      }));
      setExpenseFile(null);
      await qc.invalidateQueries({ queryKey: ['petty-cash'] });
    },
    onError: (e: unknown) =>
      toast.error(
        (e as { response?: { data?: { error?: { message?: string } } }; message?: string })?.response?.data?.error
          ?.message || (e as Error).message || 'Failed to save voucher',
      ),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/petty-cash/${id}`);
    },
    onSuccess: async () => {
      toast.success('Voucher removed');
      await qc.invalidateQueries({ queryKey: ['petty-cash'] });
    },
    onError: () => toast.error('Failed to delete'),
  });

  async function downloadExcel() {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await api.get('/petty-cash/export/excel', {
        responseType: 'blob',
        params: {
          from: rangeFrom,
          to: rangeTo,
          ...(category ? { category } : {}),
        },
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `petty-cash-${rangeFrom}-to-${rangeTo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel downloaded');
    } catch {
      toast.error('Excel download failed');
    } finally {
      setDownloading(false);
    }
  }

  async function openAttachment(id: string, name?: string | null) {
    try {
      const res = await api.get(`/petty-cash/${id}/attachment`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noreferrer';
      a.download = name || 'voucher';
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      toast.error('Could not open attachment');
    }
  }

  return (
    <div>
      <PageHeader
        title="Petty Cash"
        subtitle="Voucher book — received, paid, running balance, and month-end close"
        actions={
          <button
            className="btn btn-secondary inline-flex items-center gap-2"
            type="button"
            disabled={downloading || rows.length === 0}
            onClick={() => void downloadExcel()}
          >
            <FileSpreadsheet size={16} strokeWidth={1.75} />
            {downloading ? 'Downloading…' : 'Download Excel'}
          </button>
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
        <FilterField label="Category">
          <select className={FILTER_CTRL} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
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

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Opening Cash"
          value={`₹${fmtBalance(s?.openingBalance ?? 0)}`}
          icon={Wallet}
          hint="Previous month closing (auto)"
        />
        <KpiCard
          label="Advances / Cash in"
          value={`₹${fmtBalance(s?.cashReceived ?? 0)}`}
          tone="good"
          hint="Petty cash advance received"
        />
        <KpiCard label="Total Expenses" value={`₹${fmtBalance(s?.totalExpenses ?? 0)}`} tone="bad" />
        <KpiCard
          label="Closing Cash"
          value={`₹${fmtBalance(s?.closingCash ?? 0)}`}
          hint="Opening + Advance − Expenses"
          tone="info"
        />
      </div>

      {canEdit ? (
        <div className="panel mb-4 p-4">
          <h3 className="mb-1 font-semibold">Petty cash taken from company</h3>
          <p className="mb-4 text-sm" style={{ color: 'var(--muted)' }}>
            Each month, enter the amount you collect from the company here. It is saved as a Petty Cash Advance
            (Received) and increases opening cash for the month.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Date received" className="mb-0">
              <input
                className="input w-full"
                type="date"
                value={advance.entryDate}
                max={today()}
                onChange={(e) => setAdvance({ ...advance, entryDate: e.target.value || today() })}
              />
            </Field>
            <Field label="Amount from company (₹)" className="mb-0">
              <input
                className="input w-full"
                type="number"
                min={0}
                value={advance.amount}
                onChange={(e) => setAdvance({ ...advance, amount: e.target.value })}
                placeholder="e.g. 5000"
              />
            </Field>
            <Field label="Approved By" className="mb-0">
              <input
                className="input w-full"
                value={advance.approvedBy}
                onChange={(e) => setAdvance({ ...advance, approvedBy: e.target.value })}
                placeholder="Manager"
              />
            </Field>
            <Field label="Remarks" className="mb-0">
              <input
                className="input w-full"
                value={advance.remarks}
                onChange={(e) => setAdvance({ ...advance, remarks: e.target.value })}
                placeholder="Optional"
              />
            </Field>
          </div>
          <div className="mt-4">
            <VoucherAttach file={advanceFile} onFile={setAdvanceFile} />
          </div>
          <div className="mt-3">
            <button
              className="btn btn-primary"
              type="button"
              disabled={saveAdvance.isPending}
              onClick={() => saveAdvance.mutate()}
            >
              {saveAdvance.isPending ? 'Saving…' : 'Save amount from company'}
            </button>
          </div>
        </div>
      ) : null}

      {canEdit ? (
        <div className="panel mb-4 p-4">
          <h3 className="mb-4 font-semibold">Record expense</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Date" className="mb-0">
              <input
                className="input w-full"
                type="date"
                value={form.entryDate}
                max={today()}
                onChange={(e) => setForm({ ...form, entryDate: e.target.value || today() })}
              />
            </Field>
            <Field label="Expense Category" className="mb-0">
              <select
                className="input w-full"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {expenseCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description" className="mb-0">
              <input
                className="input w-full"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Staff refreshments"
              />
            </Field>
            <Field label="Approved By" className="mb-0">
              <input
                className="input w-full"
                value={form.approvedBy}
                onChange={(e) => setForm({ ...form, approvedBy: e.target.value })}
                placeholder="Manager"
              />
            </Field>
            <Field label="Paid (₹)" className="mb-0">
              <input
                className="input w-full"
                type="number"
                min={0}
                value={form.paid}
                onChange={(e) => setForm({ ...form, paid: e.target.value })}
                placeholder="Expense"
              />
            </Field>
            <Field label="Remarks" className="mb-0">
              <input
                className="input w-full"
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                placeholder="Bill / receipt no."
              />
            </Field>
          </div>
          <div className="mt-4">
            <VoucherAttach file={expenseFile} onFile={setExpenseFile} />
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn btn-primary" type="button" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : 'Save Expense'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="panel p-4">
        <h3 className="mb-3 font-semibold">
          {fmtDate(rangeFrom)} – {fmtDate(rangeTo)} — {rows.length} {rows.length === 1 ? 'voucher' : 'vouchers'}
        </h3>
        {book.isLoading && !book.data ? (
          <LoadingBlock />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Voucher No.</th>
                  <th>Expense Category</th>
                  <th>Description</th>
                  <th>Received (₹)</th>
                  <th>Paid (₹)</th>
                  <th>Balance (₹)</th>
                  <th>Approved By</th>
                  <th>Remarks</th>
                  <th>Attachment</th>
                  {canEdit ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 11 : 10} className="py-8 text-center" style={{ color: 'var(--muted)' }}>
                      No petty cash vouchers in this period.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td>{fmtDate(r.entryDate)}</td>
                      <td className="tabular-nums">{r.voucherNo}</td>
                      <td>{r.category}</td>
                      <td>{r.description}</td>
                      <td className="tabular-nums">{fmtMoney(r.received)}</td>
                      <td className="tabular-nums">{fmtMoney(r.paid)}</td>
                      <td className="tabular-nums font-medium">{fmtBalance(r.balance)}</td>
                      <td>{r.approvedBy || '—'}</td>
                      <td>{r.remarks || '—'}</td>
                      <td>
                        {r.hasAttachment ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-sm font-medium"
                            style={{ color: 'var(--accent)' }}
                            onClick={() => void openAttachment(r.id, r.attachmentName)}
                            title={r.attachmentName || 'Open voucher'}
                          >
                            <Paperclip size={14} />
                            View
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                      {canEdit ? (
                        <td>
                          <IconButton
                            title="Delete"
                            danger
                            type="button"
                            onClick={() => {
                              if (window.confirm('Delete this voucher? Running balance will recast.')) {
                                remove.mutate(r.id);
                              }
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
