/** Known typo brand names → canonical key (lowercase). */
const TYPO_ALIASES: Record<string, string> = {
  'lavin ornage': 'lavin orange',
  'gloden drop': 'golden drop',
};

export function canonicalBrandKey(name: string): string {
  const k = name.trim().toLowerCase();
  return TYPO_ALIASES[k] ?? k;
}

function isTypoBrandName(name: string): boolean {
  return TYPO_ALIASES[name.trim().toLowerCase()] != null;
}

/** One product per brand; typo duplicates (e.g. Lavin Ornage) collapse to the best match. */
export function pickProductOptions(
  entries: Array<{ brandName: string; productId: string; skuCount: number }>,
): Array<{ id: string; name: string }> {
  const best = new Map<
    string,
    { productId: string; name: string; skuCount: number; isTypo: boolean }
  >();

  for (const e of entries) {
    const key = canonicalBrandKey(e.brandName);
    const isTypo = isTypoBrandName(e.brandName);
    const prev = best.get(key);
    if (
      !prev ||
      e.skuCount > prev.skuCount ||
      (e.skuCount === prev.skuCount && prev.isTypo && !isTypo)
    ) {
      best.set(key, {
        productId: e.productId,
        name: e.brandName,
        skuCount: e.skuCount,
        isTypo,
      });
    }
  }

  return [...best.values()]
    .map((v) => ({ id: v.productId, name: v.name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
