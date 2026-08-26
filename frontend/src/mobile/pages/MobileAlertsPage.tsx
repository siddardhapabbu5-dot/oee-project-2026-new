import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api, { type ApiResponse } from '../../lib/api';

type Note = {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
};

export default function MobileAlertsPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['notifications-page'],
    queryFn: async () => (await api.get<ApiResponse<Note[]>>('/notifications')).data.data,
  });

  const readOne = useMutation({
    mutationFn: async (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['notifications-page'] });
      await qc.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });

  const readAll = useMutation({
    mutationFn: async () => api.post('/notifications/read-all'),
    onSuccess: async () => {
      toast.success('All alerts marked read');
      await qc.invalidateQueries({ queryKey: ['notifications-page'] });
      await qc.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });

  const items = list.data ?? [];

  return (
    <div>
      <div className="phone-hello">
        <h2>Alerts</h2>
        <p>{items.filter((n) => !n.isRead).length} unread</p>
      </div>

      {items.length > 0 ? (
        <button type="button" className="phone-btn phone-btn--ghost mb-3" onClick={() => readAll.mutate()}>
          Mark all read
        </button>
      ) : null}

      {list.isLoading ? <div className="phone-empty panel">Loading alerts…</div> : null}
      {!list.isLoading && items.length === 0 ? <div className="phone-empty panel">No alerts yet.</div> : null}

      {items.map((n) => (
        <button
          key={n.id}
          type="button"
          className={`panel phone-alert ${n.isRead ? '' : 'is-unread'}`}
          style={{ width: '100%', textAlign: 'left', cursor: n.isRead ? 'default' : 'pointer' }}
          onClick={() => {
            if (!n.isRead) readOne.mutate(n.id);
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="font-semibold">{n.title}</div>
            <span className="text-[11px] font-semibold uppercase" style={{ color: 'var(--muted)' }}>
              {n.type}
            </span>
          </div>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            {n.message}
          </p>
          <div className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
            {new Date(n.createdAt).toLocaleString()}
          </div>
        </button>
      ))}
    </div>
  );
}
