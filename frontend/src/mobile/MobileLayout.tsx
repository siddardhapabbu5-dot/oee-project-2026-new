import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ClipboardList, Gauge, LayoutGrid, MoreHorizontal } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore, useThemeStore } from '../store';
import { useSessionTimeout } from '../hooks/useSessionTimeout';
import api, { type ApiResponse } from '../lib/api';
import { setUiMode } from './lib/preferPhone';
import './mobile.css';
import { useEffect } from 'react';

const TABS = [
  { to: '/m', label: 'Home', icon: Gauge, end: true },
  { to: '/m/floor', label: 'Floor', icon: ClipboardList, end: false },
  { to: '/m/lines', label: 'Lines', icon: LayoutGrid, end: false },
  { to: '/m/alerts', label: 'Alerts', icon: Bell, end: false },
  { to: '/m/more', label: 'More', icon: MoreHorizontal, end: false },
] as const;

export default function MobileLayout() {
  const user = useAuthStore((s) => s.user);
  const { theme, setTheme } = useThemeStore();
  const location = useLocation();
  const navigate = useNavigate();
  useSessionTimeout();

  useEffect(() => {
    setUiMode('phone');
  }, []);

  useEffect(() => {
    setTheme(theme);
  }, [theme, setTheme]);

  const unreadQuery = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: async () =>
      (await api.get<ApiResponse<{ unread: number }>>('/notifications/unread-count')).data.data,
    refetchInterval: () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
      return 120_000;
    },
    staleTime: 60_000,
  });

  const unread = unreadQuery.data?.unread ?? 0;
  const title =
    location.pathname.startsWith('/m/floor')
      ? 'Shop floor'
      : location.pathname.startsWith('/m/lines')
        ? 'Lines'
        : location.pathname.startsWith('/m/alerts')
          ? 'Alerts'
          : location.pathname.startsWith('/m/more')
            ? 'More'
            : 'Today';

  return (
    <div className="phone-app">
      <header className="phone-top">
        <div className="phone-top__brand">
          <img
            src="/nakshatra-logo.png"
            alt=""
            className="phone-top__logo"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="phone-top__title">
            <h1>{title}</h1>
            <p>
              {user?.firstName} {user?.lastName}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="header-icon-btn relative"
          aria-label="Alerts"
          onClick={() => navigate('/m/alerts')}
        >
          <Bell size={18} strokeWidth={1.75} />
          {unread > 0 ? (
            <span
              className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold text-white"
              style={{ background: 'var(--danger)' }}
            >
              {unread}
            </span>
          ) : null}
        </button>
      </header>

      <main className="phone-body">
        <Outlet />
      </main>

      <nav className="phone-nav" aria-label="Phone app">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) => `phone-nav__item ${isActive ? 'active' : ''}`}
            >
              <span className="relative">
                <Icon size={18} strokeWidth={1.85} />
                {tab.to === '/m/alerts' && unread > 0 ? (
                  <span className="phone-nav__badge">{unread > 9 ? '9+' : unread}</span>
                ) : null}
              </span>
              {tab.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
