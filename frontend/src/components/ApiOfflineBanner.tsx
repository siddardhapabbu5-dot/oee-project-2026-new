import { useApiHealth } from '../hooks/useApiHealth';
import { API_OFFLINE_HINT, API_OFFLINE_MESSAGE } from '../lib/network';

export default function ApiOfflineBanner() {
  const health = useApiHealth();
  const offline = health.isError || (health.data && health.data.status !== 'ok');
  const dbDown = health.data?.database && health.data.database !== 'up';

  if (!offline && !dbDown) return null;

  return (
    <div
      className="border-b px-4 py-3 text-sm"
      style={{
        background: 'color-mix(in srgb, var(--danger) 12%, var(--panel))',
        borderColor: 'color-mix(in srgb, var(--danger) 35%, transparent)',
        color: 'var(--text)',
      }}
      role="alert"
    >
      <p className="font-semibold" style={{ color: 'var(--danger)' }}>
        {dbDown && !offline ? 'Database is not connected' : 'OEE server is offline'}
      </p>
      <p className="mt-1">{API_OFFLINE_MESSAGE}</p>
      <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
        {API_OFFLINE_HINT}
      </p>
      {health.isFetching ? (
        <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
          Checking connection…
        </p>
      ) : (
        <button
          type="button"
          className="btn btn-secondary mt-2"
          onClick={() => void health.refetch()}
        >
          Retry connection
        </button>
      )}
    </div>
  );
}
