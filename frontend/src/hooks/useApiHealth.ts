import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

type HealthPayload = {
  status: string;
  service?: string;
  database?: string;
};

export function useApiHealth() {
  return useQuery({
    queryKey: ['api-health'],
    queryFn: async () => {
      const res = await axios.get<HealthPayload>('/health', { timeout: 8000 });
      return res.data;
    },
    retry: 2,
    retryDelay: (n) => Math.min(1500 * 2 ** n, 6000),
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
}
