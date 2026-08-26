import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api, { type ApiResponse } from '../../lib/api';
import { metricColor } from '../../lib/metricBands';
import { fmtHoursFromMins, fmtNum, fmtPct, localYmd } from '../lib/dates';

type LineRow = {
  lineId: string;
  lineCode: string;
  lineName: string;
  plantName: string;
  status: string;
  plannedCases: number;
  actualCases: number;
  achievement: number;
  downtimeMins: number;
  availability: number;
  performance: number;
  quality: number;
  oee: number;
};

type LineWisePayload = {
  lines: LineRow[];
  totals: { oee: number; achievement: number; actualCases: number; plannedCases: number };
};

function statusDot(status: string) {
  if (status === 'Completed' || status === 'Running') return 'good';
  if (status === 'Down') return 'bad';
  if (status === 'Idle') return 'warn';
  return '';
}

export default function MobileLinesPage() {
  const today = localYmd();
  const data = useQuery({
    queryKey: ['mobile-line-wise', today],
    queryFn: async () =>
      (await api.get<ApiResponse<LineWisePayload>>('/dashboard/line-wise', { params: { date: today } })).data.data,
    placeholderData: keepPreviousData,
  });

  const lines = data.data?.lines ?? [];
  const totals = data.data?.totals;

  return (
    <div>
      <div className="phone-hello">
        <h2>Line status</h2>
        <p>Today · {fmtPct(totals?.oee ?? 0)} plant OEE</p>
      </div>

      {data.isLoading ? <div className="phone-empty panel">Loading lines…</div> : null}
      {!data.isLoading && lines.length === 0 ? (
        <div className="phone-empty panel">No line activity for today.</div>
      ) : null}

      {lines.map((line) => (
        <Link key={line.lineId} to="/m/floor" className="panel phone-card phone-wo" style={{ display: 'block' }}>
          <div className="phone-wo__row">
            <span className="phone-wo__num">{line.lineName}</span>
            <span className="phone-line-status">
              <span className={`phone-dot ${statusDot(line.status)}`} />
              {line.status || '—'}
            </span>
          </div>
          <div className="phone-wo__meta">
            {line.plantName} · {line.lineCode}
          </div>
          <div className="phone-pillars" style={{ marginTop: '0.7rem' }}>
            <div>
              <span className="phone-pillar__k">OEE</span>
              <span className="phone-pillar__v" style={{ color: metricColor('oee', line.oee) }}>
                {fmtPct(line.oee)}
              </span>
            </div>
            <div>
              <span className="phone-pillar__k">Ach.</span>
              <span className="phone-pillar__v" style={{ color: metricColor('achievement', line.achievement) }}>
                {fmtPct(line.achievement)}
              </span>
            </div>
            <div>
              <span className="phone-pillar__k">DT</span>
              <span className="phone-pillar__v">{fmtHoursFromMins(line.downtimeMins)}</span>
            </div>
          </div>
          <div className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
            {fmtNum(line.actualCases)} / {fmtNum(line.plannedCases)} cases
          </div>
        </Link>
      ))}
    </div>
  );
}
