function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function formatTime24(value: string | Date) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toTimeOnly(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function combineDateAndTime(dateStr: string, timeStr: string) {
  const day = dateStr.slice(0, 10);
  const time = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  return new Date(`${day}T${time}`);
}

export function timeToMins(timeStr: string) {
  const [h, m] = timeStr.slice(0, 5).split(':').map(Number);
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

export function dateToMinsOfDay(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

export function timeFromIso(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const match = String(value).match(/T(\d{2}:\d{2})/);
    return match?.[1] || '';
  }
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function addMinutesToTime(timeStr: string, addMins: number) {
  const base = timeToMins(timeStr);
  const next = ((base + addMins) % (24 * 60) + 24 * 60) % (24 * 60);
  return `${pad(Math.floor(next / 60))}:${pad(next % 60)}`;
}

export function planHourSlots(plannedStartTime?: string | null, plannedEndTime?: string | null) {
  if (!plannedStartTime || !plannedEndTime) return [] as Array<{ from: string; to: string }>;
  const start = new Date(plannedStartTime);
  let end = new Date(plannedEndTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);

  const slots: Array<{ from: string; to: string }> = [];
  let cursor = new Date(start);
  for (let i = 0; i < 24 && cursor < end; i++) {
    const next = new Date(cursor.getTime() + 60 * 60 * 1000);
    const slotEnd = next > end ? end : next;
    slots.push({ from: toTimeOnly(cursor), to: toTimeOnly(slotEnd) });
    cursor = next;
  }
  return slots;
}

export function shiftAnchorMins(plannedStartTime?: string | null) {
  if (!plannedStartTime) return 0;
  const d = new Date(plannedStartTime);
  if (Number.isNaN(d.getTime())) return 0;
  return dateToMinsOfDay(d);
}

export function shiftOrderKey(iso: string | Date, anchorMins: number) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return Number.MAX_SAFE_INTEGER;
  let rel = dateToMinsOfDay(d) - anchorMins;
  if (rel < 0) rel += 24 * 60;
  return rel;
}

function occupiedSlotKeys(entries: Array<{ hourStart: string }>, anchorMins: number) {
  const keys = new Set<string>();
  for (const e of entries) {
    const d = new Date(e.hourStart);
    if (Number.isNaN(d.getTime())) continue;
    keys.add(String(shiftOrderKey(e.hourStart, anchorMins)));
  }
  return keys;
}

export function nextFreePlanSlot(
  plannedStartTime?: string | null,
  plannedEndTime?: string | null,
  entries: Array<{ hourStart: string }> = [],
) {
  const slots = planHourSlots(plannedStartTime, plannedEndTime);
  if (slots.length === 0) {
    const from = timeFromIso(plannedStartTime) || '06:00';
    return { from, to: addMinutesToTime(from, 60) };
  }
  const anchor = shiftAnchorMins(plannedStartTime);
  const taken = occupiedSlotKeys(entries, anchor);
  for (const slot of slots) {
    const key = String((timeToMins(slot.from) - anchor + 24 * 60) % (24 * 60));
    if (!taken.has(key)) return slot;
  }
  return slots[slots.length - 1];
}

export function combineShiftDateTime(planDate: string, timeStr: string, anchorMins: number) {
  let dt = combineDateAndTime(planDate, timeStr);
  if (timeToMins(timeStr) < anchorMins) {
    dt = new Date(dt.getTime() + 24 * 60 * 60 * 1000);
  }
  return dt;
}

export function minsBetweenTimes(dateStr: string, start?: string, end?: string) {
  if (!start || !end) return 0;
  const a = combineDateAndTime(dateStr, start).getTime();
  let b = combineDateAndTime(dateStr, end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  if (b <= a) b += 24 * 60 * 60 * 1000;
  return Math.round((b - a) / 60000);
}
