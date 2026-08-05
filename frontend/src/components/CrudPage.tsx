import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import api, { type ApiResponse } from '../lib/api';
import { Badge, EmptyState, Field, IconButton, LoadingBlock, Modal, PageHeader, SortableTh } from '../components/ui';

type Column<T> = { key: keyof T | string; label: string; render?: (row: T) => ReactNode };

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
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string>(String(columns[0]?.key ?? 'id'));
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const qc = useQueryClient();
  const key = queryKey ?? endpoint;

  const list = useQuery({
    queryKey: [key, search],
    queryFn: async () => {
      const res = await api.get<ApiResponse<T[]>>(endpoint, { params: { search, limit: 100 } });
      return res.data;
    },
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
      await qc.invalidateQueries({ queryKey: [key] });
    },
    onError: (err: unknown) => {
      toast.error((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Save failed');
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`${endpoint}/${id}`),
    onSuccess: async () => {
      toast.success('Deleted');
      await qc.invalidateQueries({ queryKey: [key] });
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
      {list.isLoading ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <div className="panel p-6">
          <EmptyState message="No records found" />
        </div>
      ) : (
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
