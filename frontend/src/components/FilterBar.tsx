import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Field } from './ui';

/** Shared control height for dashboard filter rows */
export const FILTER_CTRL = 'input box-border h-10';

/**
 * Aligned filter toolbar for dashboards.
 * Use FilterField for every control (including buttons) so labels share one baseline.
 */
export function FilterBar({
  children,
  columnsClassName = 'sm:grid-cols-2 lg:grid-cols-4',
}: {
  children: ReactNode;
  columnsClassName?: string;
}) {
  return (
    <div className="panel mb-4 p-4">
      <div className={clsx('grid grid-cols-2 items-start gap-3', columnsClassName)}>{children}</div>
    </div>
  );
}

export function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Field label={label} className={clsx('mb-0', className)}>
      {children}
    </Field>
  );
}
