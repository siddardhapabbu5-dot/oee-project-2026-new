import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  setSession: (token: string, user: AuthUser) => void;
  clearSession: () => void;
  updateUser: (user: Partial<AuthUser>) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setSession: (token, user) => {
        localStorage.setItem('pms_token', token);
        localStorage.setItem('pms_user', JSON.stringify(user));
        localStorage.setItem('pms_login_at', String(Date.now()));
        set({ token, user });
      },
      clearSession: () => {
        localStorage.removeItem('pms_token');
        localStorage.removeItem('pms_user');
        localStorage.removeItem('pms_login_at');
        set({ token: null, user: null });
      },
      updateUser: (partial) => {
        const current = get().user;
        if (!current) return;
        const user = { ...current, ...partial };
        localStorage.setItem('pms_user', JSON.stringify(user));
        set({ user });
      },
    }),
    {
      name: 'pms-auth',
      onRehydrateStorage: () => (state) => {
        if (state?.token) localStorage.setItem('pms_token', state.token);
        if (state?.user) localStorage.setItem('pms_user', JSON.stringify(state.user));
      },
    },
  ),
);

type ThemeState = {
  theme: 'light' | 'dark';
  toggle: () => void;
  setTheme: (t: 'light' | 'dark') => void;
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      toggle: () => {
        const next = get().theme === 'light' ? 'dark' : 'light';
        document.documentElement.classList.toggle('dark', next === 'dark');
        set({ theme: next });
      },
      setTheme: (theme) => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        set({ theme });
      },
    }),
    { name: 'pms-theme' },
  ),
);
