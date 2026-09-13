import type { AxiosError } from 'axios';

/** True when the browser could not reach the API (server stopped, wrong port, proxy refused). */
export function isApiUnreachable(error: unknown): boolean {
  const ax = error as AxiosError | undefined;
  if (!ax) return false;
  if (!ax.response) return true;
  if (ax.code === 'ERR_NETWORK' || ax.code === 'ECONNABORTED') return true;
  return false;
}

export const API_OFFLINE_MESSAGE =
  'Server API is not running. In the OEE project folder run: npm run dev (needs Docker Desktop for the database).';

export const API_OFFLINE_HINT =
  'Keep that terminal open. Then refresh this page. Frontend: http://localhost:5176 · API: http://localhost:4000';
