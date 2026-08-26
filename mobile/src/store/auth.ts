import { create } from 'zustand';
import api, { clearToken, getToken, saveToken, type ApiResponse } from '../lib/api';

export type Role = 'ADMIN' | 'PRODUCTION_MANAGER' | 'LINE_SUPERVISOR';

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  plantId: string | null;
  employeeId?: string;
  phone?: string | null;
};

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  hydrated: false,
  hydrate: async () => {
    try {
      const token = await getToken();
      if (!token) {
        set({ token: null, user: null, hydrated: true });
        return;
      }
      const res = await api.get<ApiResponse<AuthUser>>('/auth/me');
      set({ token, user: res.data.data, hydrated: true });
    } catch {
      await clearToken();
      set({ token: null, user: null, hydrated: true });
    }
  },
  login: async (email, password) => {
    const res = await api.post<ApiResponse<{ token: string; user: AuthUser }>>('/auth/login', {
      email,
      password,
    });
    const { token, user } = res.data.data;
    await saveToken(token);
    set({ token, user });
  },
  logout: async () => {
    await clearToken();
    set({ token: null, user: null });
  },
}));
