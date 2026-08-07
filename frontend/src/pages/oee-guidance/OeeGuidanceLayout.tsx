import { NavLink, Outlet } from 'react-router-dom';
import { BookOpen, Gauge, PackageSearch, Scale, TimerOff } from 'lucide-react';
import { PageHeader } from '../../components/ui';

const TABS = [
  { to: '/oee-guidance', end: true, label: 'Overview', icon: BookOpen },
  { to: '/oee-guidance/rating-scale', end: false, label: 'Rating scale', icon: Scale },
  { to: '/oee-guidance/availability', end: false, label: 'Availability', icon: TimerOff },
  { to: '/oee-guidance/performance', end: false, label: 'Performance', icon: Gauge },
  { to: '/oee-guidance/quality', end: false, label: 'Quality', icon: PackageSearch },
] as const;

export default function OeeGuidanceLayout() {
  return (
    <div>
      <PageHeader
        title="OEE Guidance"
        subtitle="Standard categories & loss reasons for bottled water lines — Availability × Performance × Quality"
      />

      <nav
        className="mb-5 flex flex-wrap gap-1.5 rounded-xl border p-1.5"
        style={{ borderColor: 'var(--border)', background: 'var(--panel-2)' }}
        aria-label="OEE Guidance sections"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'shadow-sm' : 'hover:opacity-90'
                }`
              }
              style={({ isActive }) =>
                isActive
                  ? {
                      background: 'var(--panel)',
                      color: 'var(--text)',
                      border: '1px solid var(--border)',
                    }
                  : {
                      color: 'var(--muted)',
                      border: '1px solid transparent',
                    }
              }
            >
              <Icon size={15} strokeWidth={1.75} />
              {tab.label}
            </NavLink>
          );
        })}
      </nav>

      <Outlet />
    </div>
  );
}
