import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarClock,
  ClipboardList,
  Gauge,
  HardHat,
  LayoutDashboard,
  Receipt,
  Wallet,
} from 'lucide-react';
import { KpiCard, LoadingBlock } from '../components/ui';
import { useAuthStore } from '../store';
import { canAccess } from '../lib/nav';
import { metricTone } from '../lib/metricBands';
import api, { type ApiResponse } from '../lib/api';

const LINKS = [
  {
    to: '/dashboard',
    label: 'Plant Dashboard',
    hint: 'KPIs, trends and downtime',
    icon: LayoutDashboard,
  },
  {
    to: '/oee',
    label: 'OEE Dashboard',
    hint: 'Availability · Performance · Quality',
    icon: Gauge,
  },
  {
    to: '/plans',
    label: 'Work Orders',
    hint: 'Shift plans and batches',
    icon: ClipboardList,
  },
  {
    to: '/production-entries',
    label: 'Production Entries',
    hint: 'Shop-floor counts and downtime',
    icon: HardHat,
  },
  {
    to: '/sales-entries',
    label: 'Sales Entries',
    hint: 'Day-book, SKUs and distributors',
    icon: Receipt,
  },
  {
    to: '/case-bookings',
    label: 'Advance Case Booking',
    hint: 'Book cases for future delivery',
    icon: CalendarClock,
  },
  {
    to: '/petty-cash',
    label: 'Petty Cash',
    hint: 'Vouchers and running balance',
    icon: Wallet,
  },
] as const;

type HomeKpis = {
  oee: number;
  availability: number;
  performance: number;
  quality: number;
  actualCases: number;
  achievement: number;
};

function today() {
  return localYmd(new Date());
}

function monthStart() {
  const d = new Date();
  return localYmd(new Date(d.getFullYear(), d.getMonth(), 1));
}

function localYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function pct(n: number | undefined) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `${Number(n).toFixed(1)}%`;
}

function cases(n: number | undefined) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('en-IN');
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Admin',
  PRODUCTION_MANAGER: 'Production Manager',
  LINE_SUPERVISOR: 'Line Supervisor',
};

export default function HomePage() {
  const user = useAuthStore((s) => s.user);
  const name = user?.firstName || 'there';
  const from = monthStart();
  const to = today();
  const links = LINKS.filter((item) => !user || canAccess(user.role, item.to));
  const when = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const summary = useQuery({
    queryKey: ['dashboard-summary', from, to, ''],
    queryFn: async () =>
      (
        await api.get<ApiResponse<{ kpis: HomeKpis }>>('/dashboard/summary', {
          params: { from, to },
        })
      ).data.data,
    staleTime: 60_000,
  });

  const kpis = summary.data?.kpis;

  return (
    <div className="home-page">
      <section className="home-welcome" aria-label="Welcome">
        <div className="min-w-0">
          <div className="home-brand">
            <img
              src="/nakshatra-logo.png"
              alt=""
              className="home-brand__logo"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <p className="home-kicker">Nakshatra Beverages</p>
          </div>
          <h1 className="home-title">Welcome, {name}</h1>
        </div>
        <div className="home-welcome__meta">
          <span className="home-date">{when}</span>
          <span className="home-role">{ROLE_LABEL[user?.role || ''] || user?.role}</span>
        </div>
      </section>

      <section aria-label="This month">
        <div className="home-section-head">
          <h2 className="home-section-title">This month</h2>
          {user && canAccess(user.role, '/dashboard') ? (
            <Link to="/dashboard" className="home-section-link">
              Open dashboard
              <ArrowRight size={14} strokeWidth={2} />
            </Link>
          ) : null}
        </div>
        {summary.isLoading ? (
          <LoadingBlock />
        ) : (
          <div className="home-kpis">
            <KpiCard
              size="sm"
              label="OEE"
              value={pct(kpis?.oee)}
              hint="A × P × Q"
              tone={metricTone('oee', kpis?.oee ?? 0)}
              icon={Gauge}
            />
            <KpiCard
              size="sm"
              label="Availability"
              value={pct(kpis?.availability)}
              hint="Run time vs planned"
              tone={metricTone('availability', kpis?.availability ?? 0)}
            />
            <KpiCard
              size="sm"
              label="Performance"
              value={pct(kpis?.performance)}
              hint="Speed vs ideal"
              tone={metricTone('performance', kpis?.performance ?? 0)}
            />
            <KpiCard
              size="sm"
              label="Quality"
              value={pct(kpis?.quality)}
              hint="Good vs total"
              tone={metricTone('quality', kpis?.quality ?? 0)}
            />
            <KpiCard size="sm" label="Cases produced" value={cases(kpis?.actualCases)} hint="Actual output" />
            <KpiCard
              size="sm"
              label="Achievement"
              value={pct(kpis?.achievement)}
              hint="Actual vs plan"
              tone={metricTone('achievement', kpis?.achievement ?? 0)}
            />
          </div>
        )}
      </section>

      <section aria-label="Jump to">
        <div className="home-section-head">
          <h2 className="home-section-title">Jump to</h2>
        </div>
        <div className="home-actions">
          {links.map(({ to, label, hint, icon: Icon }) => (
            <Link key={to} to={to} className="home-action">
              <span className="home-action__icon">
                <Icon size={18} strokeWidth={1.7} />
              </span>
              <span className="home-action__copy">
                <span className="home-action__label">{label}</span>
                <span className="home-action__hint">{hint}</span>
              </span>
              <ArrowRight className="home-action__arrow" size={16} strokeWidth={1.75} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
