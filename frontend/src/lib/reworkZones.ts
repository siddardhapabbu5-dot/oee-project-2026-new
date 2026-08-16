export const REWORK_ZONES = [
  { zone: 'BLOW_MOULD', label: 'Blow Mould', short: 'Blow' },
  { zone: 'FILLER', label: 'Filler', short: 'Fill' },
  { zone: 'CAPPER', label: 'Capper', short: 'Cap' },
  { zone: 'LABEL', label: 'Label', short: 'Label' },
  { zone: 'PACKAGING', label: 'Packaging', short: 'Pack' },
  { zone: 'OTHER', label: 'Other', short: 'Other' },
] as const;

export type ReworkZoneCode = (typeof REWORK_ZONES)[number]['zone'];

export type ReworkByZoneMap = Record<ReworkZoneCode, string>;

export function emptyReworkByZone(): ReworkByZoneMap {
  return {
    BLOW_MOULD: '',
    FILLER: '',
    CAPPER: '',
    LABEL: '',
    PACKAGING: '',
    OTHER: '',
  };
}

export function reworkRowsFromMap(map: ReworkByZoneMap) {
  return REWORK_ZONES.map(({ zone }) => ({
    zone,
    reworkCases: Number(map[zone] || 0) || 0,
  })).filter((r) => r.reworkCases > 0);
}

export function mapFromReworkEntries(
  entries?: Array<{ zone: string; reworkCases: number }> | null,
): ReworkByZoneMap {
  const map = emptyReworkByZone();
  for (const e of entries ?? []) {
    if (e.zone in map) map[e.zone as ReworkZoneCode] = String(e.reworkCases || 0);
  }
  return map;
}

export function sumReworkMap(map: ReworkByZoneMap) {
  return REWORK_ZONES.reduce((s, { zone }) => s + (Number(map[zone] || 0) || 0), 0);
}
