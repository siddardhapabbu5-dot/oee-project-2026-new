import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, ChevronDown, LogOut, Menu, Moon, Search, Sun, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore, useThemeStore } from '../store';
import { NAV_ITEMS, SEARCH_KPIS, canAccess } from '../lib/nav';
import api, { type ApiResponse } from '../lib/api';
import { useSessionTimeout } from '../hooks/useSessionTimeout';
import { formatWorkOrder } from '../lib/workOrder';

type SearchPayload = {
  plants: Array<{ id: string; name: string; code?: string }>;
  lines: Array<{ id: string; name: string; code?: string }>;
  products: Array<{ id: string; name: string; code?: string }>;
  plans: Array<{ id: string; planNumber: string; batchNumber?: string }>;
  users: Array<{ id: string; firstName: string; lastName: string; email: string }>;
};

export default function AppLayout() {
  const { user, clearSession } = useAuthStore();
  const { theme, toggle, setTheme } = useThemeStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true,
  );
  const [q, setQ] = useState('');
  const [navQ, setNavQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  useSessionTimeout();

  useEffect(() => {
    setTheme(theme);
  }, [theme, setTheme]);

  // Keep sidebar open by default on desktop resize; closed on small screens
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    function onChange(e: MediaQueryListEvent) {
      setOpen(e.matches);
    }
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 280);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') setSearchOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    function onPointer(e: MouseEvent) {
      if (!searchWrapRef.current?.contains(e.target as Node)) setSearchOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, []);

  const items = useMemo(
    () => NAV_ITEMS.filter((n) => user && n.roles.includes(user.role)),
    [user],
  );

  const groups = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const item of items) {
      const arr = map.get(item.group) ?? [];
      arr.push(item);
      map.set(item.group, arr);
    }
    return [...map.entries()];
  }, [items]);

  const filteredGroups = useMemo(() => {
    const term = navQ.trim().toLowerCase();
    if (!term) return groups;
    return groups
      .map(([group, links]) => {
        const matched =
          term.length === 1
            ? links.filter((l) => l.label.toLowerCase().startsWith(term))
            : [
                ...links.filter((l) => l.label.toLowerCase().startsWith(term)),
                ...links.filter(
                  (l) =>
                    !l.label.toLowerCase().startsWith(term) &&
                    (l.label.toLowerCase().includes(term) || group.toLowerCase().includes(term)),
                ),
              ];
        return [group, matched] as const;
      })
      .filter(([, links]) => links.length > 0);
  }, [groups, navQ]);

  const activeGroup = useMemo(() => {
    const hit = items.find(
      (n) => location.pathname === n.path || location.pathname.startsWith(`${n.path}/`),
    );
    return hit?.group ?? 'Overview';
  }, [items, location.pathname]);

  const [deptOpen, setDeptOpen] = useState<Record<string, boolean>>({});
  const searching = navQ.trim().length > 0;

  useEffect(() => {
    setDeptOpen((prev) => {
      if (prev[activeGroup] !== false) return prev;
      const next = { ...prev };
      delete next[activeGroup];
      return next;
    });
  }, [activeGroup]);

  function isDeptOpen(group: string) {
    if (searching) return true;
    if (group in deptOpen) return deptOpen[group];
    return group === 'Overview' || group === activeGroup;
  }

  const pageHits = useMemo(() => {
    const term = debouncedQ.toLowerCase();
    if (term.length < 1) return [];
    return items
      .filter(
        (n) =>
          n.label.toLowerCase().includes(term) ||
          n.group.toLowerCase().includes(term) ||
          n.path.toLowerCase().includes(term),
      )
      .slice(0, 6);
  }, [debouncedQ, items]);

  const kpiHits = useMemo(() => {
    const term = debouncedQ.toLowerCase();
    if (term.length < 1 || !user) return [];
    return SEARCH_KPIS.filter((k) => {
      if (!canAccess(user.role, k.path)) return false;
      if (k.label.toLowerCase().includes(term)) return true;
      if (k.hint.toLowerCase().includes(term)) return true;
      return k.keywords.some((kw) => kw.includes(term));
    }).slice(0, 8);
  }, [debouncedQ, user]);

  function renderKpiHits() {
    if (kpiHits.length === 0) return null;
    return (
      <div>
        <div className="mb-1 text-xs uppercase" style={{ color: 'var(--muted)' }}>
          KPIs
        </div>
        {kpiHits.map((k) => (
          <button
            key={`${k.label}-${k.path}`}
            type="button"
            className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--panel-2)]"
            style={{ color: 'var(--text)' }}
            onClick={() => goTo(k.path)}
          >
            {k.label}
            <span className="ml-2 text-xs" style={{ color: 'var(--muted)' }}>
              {k.hint}
            </span>
          </button>
        ))}
      </div>
    );
  }

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

  const search = useQuery({
    queryKey: ['search', debouncedQ],
    enabled: debouncedQ.length >= 2,
    staleTime: 30_000,
    retry: 1,
    queryFn: async () =>
      (await api.get<ApiResponse<SearchPayload>>('/search', { params: { q: debouncedQ } })).data.data,
  });

  const unread = unreadQuery.data?.unread ?? 0;
  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase();

  const dataHits = search.data;
  const recordCount =
    (dataHits?.plants.length ?? 0) +
    (dataHits?.lines.length ?? 0) +
    (dataHits?.products.length ?? 0) +
    (dataHits?.plans.length ?? 0) +
    (dataHits?.users.length ?? 0);

  function goTo(path: string) {
    setSearchOpen(false);
    setQ('');
    setDebouncedQ('');
    navigate(path);
  }

  function logout() {
    clearSession();
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen w-full" style={{ background: 'var(--bg)' }}>
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-dvh max-h-dvh w-[232px] shrink-0 flex-col border-r transform transition duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        } ${open ? 'md:sticky md:top-0 md:pointer-events-auto md:translate-x-0' : 'md:fixed'}`}
        style={{
          background: 'var(--sidebar)',
          borderColor: 'var(--sidebar-border)',
          color: 'var(--sidebar-text)',
          boxShadow: 'var(--shadow-sm)',
        }}
        aria-hidden={!open}
      >
        <div className="flex h-[52px] shrink-0 items-center justify-between gap-2 px-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md"
              style={{ background: 'rgba(140, 160, 180, 0.12)' }}
            >
              <img src="/nakshatra-logo.png" alt="Nakshatra Beverages" className="h-full w-full object-contain p-0.5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[0.95rem] font-semibold leading-tight" style={{ color: 'var(--sidebar-heading)' }}>
                Nakshatra
              </div>
              <div className="truncate text-[10px] leading-tight" style={{ color: 'var(--sidebar-text)' }}>
                Beverages
              </div>
            </div>
          </div>
          <button
            type="button"
            className="header-icon-btn"
            style={{ width: '1.85rem', height: '1.85rem' }}
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X size={16} />
          </button>
        </div>

        <div className="shrink-0 px-2.5 pb-2">
          <label className="relative block">
            <Search
              size={14}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--sidebar-text)' }}
              aria-hidden
            />
            <input
              className="sidebar-search"
              type="search"
              value={navQ}
              onChange={(e) => setNavQ(e.target.value)}
              placeholder="Search menu (A–Z)"
              aria-label="Search menu by name or first letter"
              autoComplete="off"
            />
            {navQ ? (
              <button
                type="button"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5"
                style={{ color: 'var(--sidebar-text)' }}
                onClick={() => setNavQ('')}
                aria-label="Clear menu search"
              >
                <X size={12} />
              </button>
            ) : null}
          </label>
        </div>

        <nav className="sidebar-nav min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pb-2 pt-0.5">
          {filteredGroups.length === 0 ? (
            <div className="px-2 py-3 text-xs" style={{ color: 'var(--sidebar-text)' }}>
              No pages start with “{navQ.trim()}”.
            </div>
          ) : null}
          {filteredGroups.map(([group, links]) => {
            const openDept = isDeptOpen(group);
            return (
            <div key={group} className={`sidebar-nav-group${openDept ? ' is-open' : ''}${group === activeGroup ? ' is-current' : ''}`}>
              <button
                type="button"
                className="sidebar-nav-label"
                onClick={() => setDeptOpen((prev) => ({ ...prev, [group]: !openDept }))}
                aria-expanded={openDept}
              >
                <span>{group}</span>
                <ChevronDown
                  size={14}
                  strokeWidth={2}
                  className={`sidebar-nav-chevron${openDept ? ' is-open' : ''}`}
                  aria-hidden
                />
              </button>
              {openDept ? (
              <div className="sidebar-nav-links">
                {links.map((link) => {
                  const Icon = link.icon;
                  return (
                    <NavLink
                      key={link.path}
                      to={link.path}
                      onClick={() => {
                        setNavQ('');
                        if (window.matchMedia('(max-width: 767px)').matches) setOpen(false);
                      }}
                      className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                    >
                      <Icon className="nav-icon" strokeWidth={1.75} />
                      <span className="truncate">{link.label}</span>
                    </NavLink>
                  );
                })}
              </div>
              ) : null}
            </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t px-2.5 py-2 space-y-1.5" style={{ borderColor: 'var(--sidebar-border)' }}>
          <button
            className="sidebar-profile flex w-full items-center gap-2 rounded-md p-1.5 text-left transition"
            onClick={() => navigate('/profile')}
          >
            <div
              className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-semibold"
              style={{ background: 'rgba(140, 160, 180, 0.22)', color: 'var(--sidebar-heading)' }}
            >
              {initials || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold" style={{ color: 'var(--sidebar-heading)' }}>
                {user?.firstName} {user?.lastName}
              </div>
              <div className="truncate text-[10px] capitalize" style={{ color: 'var(--sidebar-text)' }}>
                {user?.role.replaceAll('_', ' ').toLowerCase()}
              </div>
            </div>
          </button>
          <button type="button" className="btn sidebar-logout flex w-full items-center justify-center gap-1.5" onClick={logout}>
            <LogOut size={14} />
            Logout
          </button>
        </div>
      </aside>

      {open ? (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col" style={{ background: 'var(--bg)' }}>
        <header
          className="sticky top-0 z-50 flex h-[64px] items-center gap-2 border-b px-4 md:px-5"
          style={{
            borderColor: 'var(--border)',
            background: 'color-mix(in oklab, var(--bg) 92%, transparent)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <button
            type="button"
            className="header-icon-btn"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            <Menu size={18} />
          </button>
          <div className="relative flex-1 max-w-xl" ref={searchWrapRef}>
            <input
              ref={searchInputRef}
              className="input header-search pr-10"
              placeholder="Search KPIs, pages, plants, lines, products, WOs…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              aria-label="Global search"
              autoComplete="off"
            />
            <Search
              size={16}
              strokeWidth={1.75}
              className="pointer-events-none absolute right-3 top-1/2 z-[1] -translate-y-1/2"
              style={{ color: '#7a8a9c' }}
              aria-hidden
            />

            {searchOpen ? (
              <div className="header-search-panel panel absolute left-0 right-0 top-[calc(100%+0.4rem)] z-50 max-h-[min(70vh,26rem)] overflow-y-auto p-3">
                {q.trim().length === 0 ? (
                  <div className="space-y-2 text-sm" style={{ color: 'var(--muted)' }}>
                    <div className="font-medium" style={{ color: 'var(--text)' }}>
                      What you can search
                    </div>
                    <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed">
                      <li>KPIs — OEE, Availability, Performance, Quality, Downtime…</li>
                      <li>Pages — Home, Dashboard, Work Orders…</li>
                      <li>Plants &amp; lines — name or code</li>
                      <li>Products — name or code</li>
                      <li>Work orders — number or batch</li>
                      {user?.role === 'ADMIN' ? <li>Users — name, email, employee ID</li> : null}
                    </ul>
                    <div className="pt-1 text-xs">Type at least 2 characters for records.</div>
                  </div>
                ) : null}

                {q.trim().length === 1 ? (
                  <div className="space-y-3 text-sm" style={{ color: 'var(--muted)' }}>
                    <div>Keep typing… (min. 2 characters for records)</div>
                    {renderKpiHits()}
                    {pageHits.length > 0 ? (
                      <div className="space-y-1">
                        <div className="mb-1 text-xs uppercase">Pages</div>
                        {pageHits.map((p) => (
                          <button
                            key={p.path}
                            type="button"
                            className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--panel-2)]"
                            style={{ color: 'var(--text)' }}
                            onClick={() => goTo(p.path)}
                          >
                            {p.label}
                            <span className="ml-2 text-xs" style={{ color: 'var(--muted)' }}>
                              {p.group}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {q.trim().length >= 2 ? (
                  <div className="space-y-3 text-sm">
                    {renderKpiHits()}
                    {pageHits.length > 0 ? (
                      <div>
                        <div className="mb-1 text-xs uppercase" style={{ color: 'var(--muted)' }}>
                          Pages
                        </div>
                        {pageHits.map((p) => (
                          <button
                            key={p.path}
                            type="button"
                            className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--panel-2)]"
                            style={{ color: 'var(--text)' }}
                            onClick={() => goTo(p.path)}
                          >
                            {p.label}
                            <span className="ml-2 text-xs" style={{ color: 'var(--muted)' }}>
                              {p.group}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {search.isFetching ? <div style={{ color: 'var(--muted)' }}>Searching records…</div> : null}

                    {search.isError ? (
                      <div style={{ color: 'var(--danger)' }}>Search failed. Check your connection and try again.</div>
                    ) : null}

                    {dataHits ? (
                      <>
                        {(
                          [
                            ['plants', 'Plants', dataHits.plants],
                            ['lines', 'Lines', dataHits.lines],
                            ['products', 'Products', dataHits.products],
                            ['plans', 'Work orders', dataHits.plans],
                            ['users', 'Users', dataHits.users],
                          ] as const
                        ).map(([key, label, rows]) =>
                          rows.length === 0 ? null : (
                            <div key={key}>
                              <div className="mb-1 text-xs uppercase" style={{ color: 'var(--muted)' }}>
                                {label}
                              </div>
                              {rows.map((item) => {
                                const path =
                                  key === 'plans'
                                    ? '/plans'
                                    : key === 'plants'
                                      ? '/plants'
                                      : key === 'lines'
                                        ? '/lines'
                                        : key === 'users'
                                          ? '/users'
                                          : '/products';
                                const text =
                                  key === 'plans'
                                    ? formatWorkOrder((item as SearchPayload['plans'][0]).planNumber)
                                    : key === 'users'
                                      ? `${(item as SearchPayload['users'][0]).firstName} ${(item as SearchPayload['users'][0]).lastName}`
                                      : (item as { name: string }).name;
                                const sub =
                                  key === 'plans'
                                    ? (item as SearchPayload['plans'][0]).batchNumber
                                    : key === 'users'
                                      ? (item as SearchPayload['users'][0]).email
                                      : (item as { code?: string }).code;
                                return (
                                  <button
                                    key={item.id}
                                    type="button"
                                    className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--panel-2)]"
                                    style={{ color: 'var(--text)' }}
                                    onClick={() => goTo(path)}
                                  >
                                    {text}
                                    {sub ? (
                                      <span className="ml-2 text-xs" style={{ color: 'var(--muted)' }}>
                                        {sub}
                                      </span>
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                          ),
                        )}
                        {!search.isFetching && pageHits.length === 0 && kpiHits.length === 0 && recordCount === 0 ? (
                          <div style={{ color: 'var(--muted)' }}>No matches for “{debouncedQ}”</div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button className="header-icon-btn relative" onClick={() => navigate('/notifications')} aria-label="Notifications">
              <Bell size={18} strokeWidth={1.75} />
              {unread > 0 ? (
                <span
                  className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold text-white"
                  style={{ background: 'var(--danger)' }}
                >
                  {unread}
                </span>
              ) : null}
            </button>
            <button className="header-icon-btn" onClick={toggle} aria-label="Toggle theme">
              {theme === 'dark' ? <Sun size={18} strokeWidth={1.75} /> : <Moon size={18} strokeWidth={1.75} />}
            </button>
            <button className="header-icon-btn" title="Logout" onClick={logout} aria-label="Logout">
              <LogOut size={18} strokeWidth={1.75} />
            </button>
            <button
              className="ml-1 grid h-9 w-9 place-items-center rounded-full text-xs font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #7367f0, #9e95f5)' }}
              onClick={() => navigate('/profile')}
              aria-label="Profile"
            >
              {initials || 'U'}
            </button>
          </div>
        </header>
        <main
          className="app-main min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4 md:p-5"
          style={{ background: 'var(--bg)' }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
