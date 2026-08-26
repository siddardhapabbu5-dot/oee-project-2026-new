import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, ClipboardList, HardHat, TimerOff } from 'lucide-react';
import api, { type ApiResponse } from '../../lib/api';
import { useAuthStore } from '../../store';
import { metricColor } from '../../lib/metricBands';
import { formatWorkOrder } from '../../lib/workOrder';
import { fmtHoursFromMins, fmtNum, fmtPct, formatDayLabel, localYmd } from '../lib/dates';

type Kpis = {
  plannedCases: number;
  actualCases: number;
  achievement: number;
  productionLoss: number;
  goodCases: number;
  rejectCases: number;
  oee: number;
  availability: number;
  performance: number;
  quality: number;
  downtime: number;
};

type PlanRow = {
  id: string;
  planNumber: string;
  productionDate: string;
  plannedCases: number;
  line: { name: string };
  shift: { name: string };
  product?: { name: string };
};

function OeeRing({ value }: { value: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  const dash = (clamped / 100) * c;
  const color = metricColor('oee', clamped);
  return (
    <div className="phone-oee__ring" aria-hidden>
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div className="phone-oee__value" style={{ color }}>
        {fmtPct(clamped, 0)}
      </div>
    </div>
  );
}

export default function MobileHomePage() {
  const user = useAuthStore((s) => s.user);
  const today = localYmd();

  const kpis = useQuery({
    queryKey: ['mobile-kpis', today],
    queryFn: async () =>
      (await api.get<ApiResponse<Kpis>>('/dashboard/kpis', { params: { from: today, to: today } })).data.data,
    placeholderData: keepPreviousData,
  });

  const plans = useQuery({
    queryKey: ['mobile-plans-today', today],
    queryFn: async () =>
      (
        await api.get<ApiResponse<PlanRow[]>>('/plans', {
          params: { from: today, to: today, limit: 20 },
        })
      ).data.data,
  });

  const k = kpis.data;
  const name = user?.firstName || 'there';

  return (
    <div>
      <div className="phone-hello">
        <h2>Hi {name}</h2>
        <p>{formatDayLabel(today)} · plant snapshot</p>
      </div>

      <div className="panel phone-oee">
        <OeeRing value={k?.oee ?? 0} />
        <div className="phone-oee__meta">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
            Today&apos;s OEE
          </div>
          <div className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            A × P × Q
          </div>
          <div className="mt-2 text-sm">
            Achievement <strong>{fmtPct(k?.achievement ?? 0)}</strong>
          </div>
        </div>
      </div>

      <div className="phone-pillars">
        <div className="panel phone-pillar">
          <span className="phone-pillar__k">Avail</span>
          <span className="phone-pillar__v" style={{ color: metricColor('availability', k?.availability ?? 0) }}>
            {fmtPct(k?.availability ?? 0)}
          </span>
        </div>
        <div className="panel phone-pillar">
          <span className="phone-pillar__k">Perf</span>
          <span className="phone-pillar__v" style={{ color: metricColor('performance', k?.performance ?? 0) }}>
            {fmtPct(k?.performance ?? 0)}
          </span>
        </div>
        <div className="panel phone-pillar">
          <span className="phone-pillar__k">Qual</span>
          <span className="phone-pillar__v" style={{ color: metricColor('quality', k?.quality ?? 0) }}>
            {fmtPct(k?.quality ?? 0)}
          </span>
        </div>
      </div>

      <div className="phone-stats">
        <div className="panel phone-stat">
          <div className="phone-stat__l">Planned</div>
          <div className="phone-stat__v">{fmtNum(k?.plannedCases ?? 0)}</div>
        </div>
        <div className="panel phone-stat">
          <div className="phone-stat__l">Actual</div>
          <div className="phone-stat__v">{fmtNum(k?.actualCases ?? 0)}</div>
        </div>
        <div className="panel phone-stat">
          <div className="phone-stat__l">Good cases</div>
          <div className="phone-stat__v">{fmtNum(k?.goodCases ?? 0)}</div>
        </div>
        <div className="panel phone-stat">
          <div className="phone-stat__l">Downtime</div>
          <div className="phone-stat__v">{fmtHoursFromMins(k?.downtime ?? 0)}</div>
        </div>
      </div>

      <div className="phone-actions">
        <Link to="/m/floor" className="panel phone-action">
          <span className="phone-action__icon">
            <HardHat size={16} />
          </span>
          <span>
            <strong>Log output</strong>
            <span>Hourly cases</span>
          </span>
        </Link>
        <Link to="/m/floor?tab=downtime" className="panel phone-action">
          <span className="phone-action__icon">
            <TimerOff size={16} />
          </span>
          <span>
            <strong>Log stop</strong>
            <span>Downtime</span>
          </span>
        </Link>
        <Link to="/m/lines" className="panel phone-action">
          <span className="phone-action__icon">
            <ClipboardList size={16} />
          </span>
          <span>
            <strong>Line status</strong>
            <span>Live OEE</span>
          </span>
        </Link>
        <Link to="/changeover-entries" className="panel phone-action">
          <span className="phone-action__icon">
            <ArrowLeftRight size={16} />
          </span>
          <span>
            <strong>Changeover</strong>
            <span>Desktop form</span>
          </span>
        </Link>
      </div>

      <section className="phone-section">
        <div className="phone-section__h">
          <h3>Today&apos;s work orders</h3>
          <Link to="/m/floor">Open floor</Link>
        </div>
        {plans.isLoading ? <div className="phone-empty panel">Loading work orders…</div> : null}
        {!plans.isLoading && (plans.data ?? []).length === 0 ? (
          <div className="phone-empty panel">No work orders for today.</div>
        ) : null}
        {(plans.data ?? []).map((p) => (
          <Link key={p.id} to={`/m/floor?planId=${p.id}`} className="panel phone-wo">
            <div className="phone-wo__row">
              <span className="phone-wo__num">{formatWorkOrder(p.planNumber)}</span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                {fmtNum(p.plannedCases)} cases
              </span>
            </div>
            <div className="phone-wo__meta">
              {p.line.name} · {p.shift.name}
              {p.product?.name ? ` · ${p.product.name}` : ''}
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
