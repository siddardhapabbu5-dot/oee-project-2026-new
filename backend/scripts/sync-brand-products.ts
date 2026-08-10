/**
 * Backfill: ensure every Brand has a linked Product for Products & SKUs dropdown.
 * Run: npx tsx scripts/sync-brand-products.ts
 */
import { masterService } from '../src/services/master.service.js';

async function main() {
  const result = await masterService.syncBrandProducts();
  console.log(`Synced ${result.products} products for ${result.brands} brands.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
