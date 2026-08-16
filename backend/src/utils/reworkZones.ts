import type { ReworkZone } from '@prisma/client';

export const REWORK_ZONES: Array<{ zone: ReworkZone; label: string }> = [
  { zone: 'BLOW_MOULD', label: 'Blow Mould' },
  { zone: 'FILLER', label: 'Filler' },
  { zone: 'CAPPER', label: 'Capper' },
  { zone: 'LABEL', label: 'Label' },
  { zone: 'PACKAGING', label: 'Packaging' },
  { zone: 'OTHER', label: 'Other' },
];

export const REWORK_ZONE_LABELS: Record<ReworkZone, string> = Object.fromEntries(
  REWORK_ZONES.map((z) => [z.zone, z.label]),
) as Record<ReworkZone, string>;

export type ReworkByZoneInput = { zone: ReworkZone; reworkCases: number };

export function normalizeReworkByZone(rows?: ReworkByZoneInput[] | null): ReworkByZoneInput[] {
  if (!rows?.length) return [];
  const allowed = new Set(REWORK_ZONES.map((z) => z.zone));
  const byZone = new Map<ReworkZone, number>();
  for (const row of rows) {
    if (!allowed.has(row.zone)) continue;
    const qty = Number(row.reworkCases) || 0;
    if (qty < 0) continue;
    byZone.set(row.zone, (byZone.get(row.zone) ?? 0) + qty);
  }
  return [...byZone.entries()]
    .filter(([, reworkCases]) => reworkCases > 0)
    .map(([zone, reworkCases]) => ({ zone, reworkCases }));
}

export function sumReworkCases(rows?: ReworkByZoneInput[] | null) {
  return normalizeReworkByZone(rows).reduce((s, r) => s + r.reworkCases, 0);
}
