/** Same shop-floor reason entered under slightly different names. */
const ALIASES: Record<string, string> = {
  'power cut': 'Power Cut',
  'powercut': 'Power Cut',
  'power cut issue': 'Power Cut',
  'powercut issue': 'Power Cut',
};

function reasonKey(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function canonicalDowntimeReasonName(name: string) {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) return trimmed;
  return ALIASES[reasonKey(trimmed)] || trimmed;
}
