/** Calendar-date helpers for Prisma `@db.Date` fields (always midnight UTC). */

export function toCalendarDate(value: Date | string): string {
  if (typeof value === 'string') {
    const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value.slice(0, 10);
    return utcYmd(dt);
  }
  return utcYmd(value);
}

function utcYmd(dt: Date) {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD (or Date) into UTC midnight for `@db.Date` writes. */
export function parseCalendarDate(value: string | Date): Date {
  const ymd = toCalendarDate(value);
  return new Date(`${ymd}T00:00:00.000Z`);
}

/**
 * Inclusive UTC day bounds for filtering `@db.Date` columns.
 * Avoids local `setHours` which shifts the range by timezone (e.g. IST)
 * and can pull the previous calendar day into dashboard results.
 */
export function calendarDateRange(from?: string, to?: string, defaultDays = 14) {
  const endYmd = to
    ? toCalendarDate(to)
    : utcYmd(new Date());
  let startYmd: string;
  if (from) {
    startYmd = toCalendarDate(from);
  } else {
    const d = new Date(`${endYmd}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - defaultDays);
    startYmd = utcYmd(d);
  }
  return {
    start: new Date(`${startYmd}T00:00:00.000Z`),
    end: new Date(`${endYmd}T23:59:59.999Z`),
  };
}
