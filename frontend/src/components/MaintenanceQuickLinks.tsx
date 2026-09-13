import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardList, Wrench } from 'lucide-react';

export function MaintenanceQuickLinks({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm ${className}`}
      style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--accent) 6%, transparent)' }}
    >
      <Wrench size={16} className="shrink-0" style={{ color: 'var(--accent)' }} />
      <span className="font-medium" style={{ color: 'var(--text)' }}>
        Maintenance &amp; Reliability
      </span>
      <Link
        to="/maintenance-reliability"
        className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
        style={{ color: 'var(--accent)' }}
      >
        MTBF / MTTR Dashboard <ArrowRight size={12} />
      </Link>
      <Link
        to="/breakdown-entries"
        className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
        style={{ color: 'var(--accent)' }}
      >
        <ClipboardList size={14} />
        Breakdown Entry <ArrowRight size={12} />
      </Link>
    </div>
  );
}
