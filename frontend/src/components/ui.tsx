import clsx from 'clsx';
import { ChevronDown, ChevronUp, ChevronsUpDown, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[1.625rem] font-medium tracking-tight" style={{ color: 'var(--text)' }}>
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-nowrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  tone = 'default',
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad' | 'info' | 'excellent' | 'fair' | 'average' | 'poor' | 'critical';
  icon?: LucideIcon;
}) {
  const color =
    tone === 'excellent'
      ? 'var(--band-excellent)'
      : tone === 'fair'
        ? 'var(--band-good)'
        : tone === 'average'
          ? 'var(--band-average)'
          : tone === 'poor'
            ? 'var(--band-poor)'
            : tone === 'critical'
              ? 'var(--band-critical)'
              : tone === 'good'
                ? 'var(--success)'
                : tone === 'warn'
                  ? 'var(--warning)'
                  : tone === 'bad'
                    ? 'var(--danger)'
                    : tone === 'info'
                      ? 'var(--info)'
                      : 'var(--accent)';
  const soft =
    tone === 'excellent'
      ? 'color-mix(in oklab, var(--band-excellent) 14%, transparent)'
      : tone === 'fair'
        ? 'color-mix(in oklab, var(--band-good) 14%, transparent)'
        : tone === 'average'
          ? 'color-mix(in oklab, var(--band-average) 14%, transparent)'
          : tone === 'poor'
            ? 'color-mix(in oklab, var(--band-poor) 14%, transparent)'
            : tone === 'critical'
              ? 'color-mix(in oklab, var(--band-critical) 14%, transparent)'
              : tone === 'good'
                ? 'color-mix(in oklab, var(--success) 14%, transparent)'
                : tone === 'warn'
                  ? 'color-mix(in oklab, var(--warning) 14%, transparent)'
                  : tone === 'bad'
                    ? 'color-mix(in oklab, var(--danger) 14%, transparent)'
                    : tone === 'info'
                      ? 'color-mix(in oklab, var(--info) 14%, transparent)'
                      : 'var(--accent-soft)';

  const valueColor = tone === 'default' ? 'var(--text)' : color;

  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
            {label}
          </div>
          <div
            className="mt-2 text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums"
            style={{ color: valueColor }}
          >
            {value}
          </div>
          {hint ? (
            <div className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
              {hint}
            </div>
          ) : null}
        </div>
        {Icon ? (
          <span className="icon-box" style={{ background: soft, color }}>
            <Icon size={20} strokeWidth={1.75} />
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={clsx('panel p-5', className)}>
      <h3 className={clsx('text-base font-medium', subtitle ? 'mb-1' : 'mb-4')}>{title}</h3>
      {subtitle ? (
        <p className="mb-4 text-xs" style={{ color: 'var(--muted)' }}>
          {subtitle}
        </p>
      ) : null}
      <div className={clsx('h-64 w-full', bodyClassName)}>{children}</div>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-40 items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
      {message}
    </div>
  );
}

export function LoadingBlock() {
  return (
    <div className="panel flex h-40 items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
      Loading...
    </div>
  );
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'good' | 'warn' | 'bad' }) {
  return <span className={clsx('badge-pill', `tone-${tone}`)}>{children}</span>;
}

/** Trendy Active / Inactive status chip for tables */
export function ActiveStatus({ active }: { active: boolean }) {
  return (
    <span className={clsx('status-chip', active ? 'is-active' : 'is-inactive')}>
      <span className="status-chip-dot" aria-hidden />
      <span>{active ? 'Active' : 'Inactive'}</span>
    </span>
  );
}

export function IconButton({
  className,
  danger,
  primary,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean; primary?: boolean }) {
  return (
    <button
      type="button"
      className={clsx('btn-icon', danger && 'danger', primary && 'primary', className)}
      {...props}
    />
  );
}

/** Table header cell with Vuexy-style up/down sort carets. */
export function SortableTh({
  label,
  active,
  direction,
  onClick,
  className,
}: {
  label: string;
  active?: boolean;
  direction?: 'asc' | 'desc' | null;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <th className={className}>
      <button type="button" className={clsx('th-sort', active && 'active')} onClick={onClick}>
        <span>{label}</span>
        {active && direction === 'asc' ? (
          <ChevronUp size={14} strokeWidth={2} className="th-sort-icon" aria-hidden />
        ) : active && direction === 'desc' ? (
          <ChevronDown size={14} strokeWidth={2} className="th-sort-icon" aria-hidden />
        ) : (
          <ChevronsUpDown size={14} strokeWidth={1.75} className="th-sort-icon" aria-hidden />
        )}
      </button>
    </th>
  );
}

/** Formatted date cell (ledger-style). */
export function DateWithIcon({ value }: { value?: string | Date | null }) {
  if (!value) {
    return <span style={{ color: 'var(--muted)' }}>—</span>;
  }

  let label: string;
  let title: string | undefined;

  if (typeof value === 'string') {
    const dayOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dayOnly) {
      const y = Number(dayOnly[1]);
      const m = Number(dayOnly[2]);
      const day = Number(dayOnly[3]);
      const d = new Date(y, m - 1, day);
      label = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      title = `${dayOnly[1]}-${dayOnly[2]}-${dayOnly[3]}`;
    } else {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) {
        label = value.slice(0, 10);
      } else {
        label = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        title = d.toISOString().slice(0, 10);
      }
    }
  } else {
    const d = value;
    if (Number.isNaN(d.getTime())) {
      return <span style={{ color: 'var(--muted)' }}>—</span>;
    }
    label = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    title = d.toISOString().slice(0, 10);
  }

  return (
    <span className="whitespace-nowrap" title={title}>
      {label}
    </span>
  );
}

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(47, 43, 61, 0.5)' }}>
      <div className="panel w-full max-w-xl max-h-[90vh] overflow-auto p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">{title}</h2>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('mb-3 block text-sm last:mb-0', className)}>
      <span className="mb-1.5 block font-medium" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      {children}
    </label>
  );
}
