import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pms_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('pms_token');
      localStorage.removeItem('pms_user');
      if (!window.location.pathname.includes('/login')) {
        const onPhone = window.location.pathname.startsWith('/m');
        window.location.href = onPhone ? '/login?next=/m' : '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default api;

export type ApiResponse<T> = {
  success: boolean;
  data: T;
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
