import { Link } from 'react-router-dom';
import { ClipboardList, Gauge, HardHat, LayoutDashboard } from 'lucide-react';
import { useAuthStore } from '../store';
import { canAccess } from '../lib/nav';

const LINKS = [
  {
    to: '/dashboard',
    label: 'Plant Dashboard',
    hint: 'KPIs & trends',
    icon: LayoutDashboard,
  },
  {
    to: '/oee',
    label: 'OEE Dashboard',
    hint: 'A · P · Q',
    icon: Gauge,
  },
  {
    to: '/plans',
    label: 'Work Orders',
    hint: 'Shift plans',
    icon: ClipboardList,
  },
  {
    to: '/production-entries',
    label: 'Production Entries',
    hint: 'Shop floor',
    icon: HardHat,
  },
] as const;

const PILLARS = [
  { key: 'A', label: 'Availability' },
  { key: 'P', label: 'Performance' },
  { key: 'Q', label: 'Quality' },
] as const;

export default function HomePage() {
  const user = useAuthStore((s) => s.user);
  const name = user?.firstName || 'there';
  const links = LINKS.filter((item) => !user || canAccess(user.role, item.to));

  return (
    <div className="home-page">
      <section className="home-hero" aria-label="Welcome">
        <div className="home-hero__media" aria-hidden>
          <img src="/home-oee.png" alt="" className="home-hero__img" />
          <div className="home-hero__veil" />
          <div className="home-hero__ring" />
        </div>

        <p className="home-greet">Welcome {name}</p>

        <div className="home-hero__content">
          <img
            src="/nakshatra-logo.png"
            alt=""
            className="home-brand-logo"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <p className="home-brand">Nakshatra Beverages</p>
          <h1 className="home-title">OEE</h1>
          <p className="home-lead">Overall Equipment Effectiveness</p>

          <ul className="home-pillars" aria-label="OEE pillars">
            {PILLARS.map((p) => (
              <li key={p.key} className="home-pillar">
                <span className="home-pillar__key">{p.key}</span>
                <span className="home-pillar__label">{p.label}</span>
              </li>
            ))}
          </ul>

          <div className="home-cta">
            <Link to="/oee" className="home-btn home-btn--primary">
              View OEE
            </Link>
            <Link to="/dashboard" className="home-btn home-btn--ghost">
              Plant Dashboard
            </Link>
          </div>
        </div>
      </section>

      <section className="home-links" aria-label="Quick links">
        <div className="home-links__rail">
          {links.map(({ to, label, hint, icon: Icon }) => (
            <Link key={to} to={to} className="home-link">
              <span className="home-link__icon">
                <Icon size={17} strokeWidth={1.6} />
              </span>
              <span className="home-link__copy">
                <span className="home-link__label">{label}</span>
                <span className="home-link__hint">{hint}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
