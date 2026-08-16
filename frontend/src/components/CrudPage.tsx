import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import api, { type ApiResponse } from '../lib/api';
import { FilterBar, FilterField, FILTER_CTRL } from '../components/FilterBar';
import { Badge, EmptyState, Field, IconButton, LoadingBlock, Modal, PageHeader, SortableTh } from '../components/ui';

type Column<T> = { key: keyof T | string; label: string; render?: (row: T) => ReactNode };

type CrudFilter = {
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  allLabel?: string;
};

export function CrudPage<T extends { id: string }>({
  title,
  subtitle,
  endpoint,
  columns,
  fields,
  mapCreate,
  canCreate = true,
  canEdit = true,
  canDelete = true,
  queryKey,
  invalidateKeys = [],
  filters = [],
  filterColumnsClassName = 'sm:grid-cols-2 lg:grid-cols-4',
  countLabel = 'records',
  countExtra,
}: {
  title: string;
  subtitle?: string;
  endpoint: string;
  columns: Column<T>[];
  fields: Array<{ name: string; label: string; type?: string; options?: Array<{ value: string; label: string }> }>;
  mapCreate?: (form: Record<string, string>) => Record<string, unknown>;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  queryKey?: string;
  /** Extra react-query keys to refresh after create/update/delete (e.g. linked masters). */
  invalidateKeys?: string[];
  /** Optional dropdown filters — sent as query params when set */
  filters?: CrudFilter[];
  filterColumnsClassName?: string;
  /** Label for result count, e.g. "SKUs" or "products" */
  countLabel?: string;
  /** Extra count detail next to main count (e.g. unique products) */
  countExtra?: (rows: T[], total: number) => ReactNode;
}) {
  const [search, setSearch] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string>(String(columns[0]?.key ?? 'id'));
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const qc = useQueryClient();
  const key = queryKey ?? endpoint;

  const activeFilters = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of filters) {
      const v = filterValues[f.name];
      if (v) out[f.name] = v;
    }
    return out;
  }, [filters, filterValues]);

  async function refreshRelated() {
    await qc.invalidateQueries({ queryKey: [key] });
    for (const k of invalidateKeys) {
      await qc.invalidateQueries({ queryKey: [k] });
    }
  }

  const list = useQuery({
    queryKey: [key, search, activeFilters],
    queryFn: async () => {
      const res = await api.get<ApiResponse<T[]>>(endpoint, {
        params: { search: search || undefined, limit: 500, ...activeFilters },
      });
      return res.data;
    },
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = mapCreate
        ? mapCreate(form)
        : Object.fromEntries(
            Object.entries(form).map(([k, v]) => {
              if (v === '') return [k, null];
              if (!Number.isNaN(Number(v)) && fields.find((f) => f.name === k)?.type === 'number') return [k, Number(v)];
              if (v === 'true' || v === 'false') return [k, v === 'true'];
              return [k, v];
            }),
          );
      if (editing) return api.patch(`${endpoint}/${editing.id}`, payload);
      return api.post(endpoint, payload);
    },
    onSuccess: async () => {
      toast.success(editing ? 'Updated' : 'Created');
      setOpen(false);
      setEditing(null);
      setForm({});
      await refreshRelated();
    },
    onError: (err: unknown) => {
      toast.error((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Save failed');
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`${endpoint}/${id}`),
    onSuccess: async () => {
      toast.success('Deleted');
      await refreshRelated();
    },
  });

  const rows = useMemo(() => {
    const items = list.data?.data ?? [];
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortKey];
      const bv = (b as unknown as Record<string, unknown>)[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      if (typeof av === 'boolean' && typeof bv === 'boolean') return (Number(av) - Number(bv)) * dir;
      return String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true, sensitivity: 'base' }) * dir;
    });
  }, [list.data, sortKey, sortDir]);

  function toggleSort(nextKey: string) {
    if (sortKey === nextKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(nextKey);
      setSortDir('asc');
    }
  }

  function openCreate() {
    setEditing(null);
    setForm({});
    setOpen(true);
  }

  function openEdit(row: T) {
    setEditing(row);
    const next: Record<string, string> = {};
    for (const f of fields) {
      const val = (row as unknown as Record<string, unknown>)[f.name];
      next[f.name] = val == null ? '' : String(val);
    }
    setForm(next);
    setOpen(true);
  }

  function clearFilters() {
    setSearch('');
    setFilterValues({});
  }

  const hasActiveFilters = Boolean(search) || Object.keys(activeFilters).length > 0;
  const totalCount = list.data?.meta?.total ?? rows.length;

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <div className="flex flex-nowrap items-center gap-2">
            <input
              className="input w-44 min-w-0 sm:w-56"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {canCreate ? (
              <button className="btn btn-primary shrink-0 whitespace-nowrap" onClick={openCreate}>
                Add New
              </button>
            ) : null}
          </div>
        }
      />

      {filters.length > 0 ? (
        <FilterBar columnsClassName={filterColumnsClassName}>
          {filters.map((f) => (
            <FilterField key={f.name} label={f.label}>
              <select
                className={FILTER_CTRL}
                value={filterValues[f.name] || ''}
                onChange={(e) => setFilterValues((prev) => ({ ...prev, [f.name]: e.target.value }))}
              >
                <option value="">{f.allLabel ?? 'All'}</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FilterField>
          ))}
          <FilterField label="Clear">
            <button
              type="button"
              className={`${FILTER_CTRL} cursor-pointer px-3 font-medium`}
              disabled={!hasActiveFilters}
              onClick={clearFilters}
            >
              Clear filters
            </button>
          </FilterField>
        </FilterBar>
      ) : null}

      {!list.isLoading || list.data ? (
        <p className="mb-3 text-sm" style={{ color: 'var(--muted)' }}>
          <strong style={{ color: 'var(--text)' }}>{totalCount.toLocaleString()}</strong>{' '}
          {countLabel}
          {totalCount === 1 ? '' : 's'}
          {hasActiveFilters ? ' matching filters' : ''}
          {countExtra ? countExtra(rows, totalCount) : null}
          {list.isFetching ? ' · updating…' : ''}
        </p>
      ) : null}

      {list.isLoading && !list.data ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <div className="panel p-6">
          <EmptyState message={search || Object.keys(activeFilters).length ? 'No records match your filters' : 'No records found'} />
        </div>
      ) : (
        <>
          {list.isFetching ? (
            <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
              Updating…
            </p>
          ) : null}
        <div className="table-wrap panel">
          <table className="data">
            <thead>
              <tr>
                {columns.map((c) => (
                  <SortableTh
                    key={String(c.key)}
                    label={c.label}
                    active={sortKey === String(c.key)}
                    direction={sortKey === String(c.key) ? sortDir : null}
                    onClick={() => toggleSort(String(c.key))}
                  />
                ))}
                {(canEdit || canDelete) && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {columns.map((c) => (
                    <td key={String(c.key)}>
                      {c.render
                        ? c.render(row)
                        : String((row as unknown as Record<string, unknown>)[c.key as string] ?? '')}
                    </td>
                  ))}
                  {(canEdit || canDelete) && (
                    <td>
                      <div className="row-actions">
                        {canEdit ? (
                          <IconButton title="Edit" primary onClick={() => openEdit(row)}>
                            <Pencil size={16} strokeWidth={1.75} />
                          </IconButton>
                        ) : null}
                        {canDelete ? (
                          <IconButton
                            title="Delete"
                            danger
                            onClick={() => {
                              if (window.confirm('Delete this record?')) remove.mutate(row.id);
                            }}
                          >
                            <Trash2 size={16} strokeWidth={1.75} />
                          </IconButton>
                        ) : null}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <Modal open={open} title={editing ? `Edit ${title}` : `Create ${title}`} onClose={() => setOpen(false)}>
        {fields.map((f) => (
          <Field key={f.name} label={f.label}>
            {f.options ? (
              <select className="input" value={form[f.name] ?? ''} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}>
                <option value="">Select...</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                type={f.type || 'text'}
                value={form[f.name] ?? ''}
                onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
              />
            )}
          </Field>
        ))}
        <button className="btn btn-primary w-full" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving...' : 'Save'}
        </button>
      </Modal>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'APPROVED' || status === 'COMPLETED' || status === 'CLOSED'
      ? 'good'
      : status === 'REJECTED' || status === 'CANCELLED'
        ? 'bad'
        : status === 'SUBMITTED' || status === 'IN_PROGRESS'
          ? 'warn'
          : 'default';
  return <Badge tone={tone}>{status}</Badge>;
}
