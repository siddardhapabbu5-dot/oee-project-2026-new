/**
 * Seed sample sales entries for Sales Dashboard (current month).
 * Run: npx tsx scripts/seed-sales.ts
 */
import { PrismaClient, type SalesChannel } from '@prisma/client';

const prisma = new PrismaClient();

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function main() {
  const plant = await prisma.plant.findFirst({ where: { deletedAt: null } });
  const skus = await prisma.sku.findMany({
    where: { deletedAt: null, isActive: true },
    include: { product: true },
    take: 8,
  });
  if (!skus.length) {
    console.log('No SKUs found — seed products/SKUs first.');
    return;
  }

  const channels: SalesChannel[] = ['DISTRIBUTOR', 'RETAIL', 'MODERN_TRADE', 'EXPORT'];
  const customers = ['City Distributors', 'Fresh Mart', 'HyperBazaar', 'Export Hub', 'Local Retail'];
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let created = 0;
  for (let d = new Date(monthStart); d <= today; d.setDate(d.getDate() + 1)) {
    const dayKey = ymd(d);
    const entriesPerDay = 2 + (d.getDate() % 3);
    for (let i = 0; i < entriesPerDay; i++) {
      const sku = skus[(d.getDate() + i) % skus.length];
      const cases = 80 + ((d.getDate() * 17 + i * 23) % 220);
      const unitPrice = 180 + ((sku.packSize || 24) % 12) * 15;
      const amount = Number((cases * unitPrice).toFixed(2));
      const channel = channels[(d.getDate() + i) % channels.length];

      await prisma.salesEntry.create({
        data: {
          saleDate: new Date(`${dayKey}T00:00:00.000Z`),
          plantId: plant?.id ?? null,
          brandId: sku.product.brandId,
          productId: sku.productId,
          skuId: sku.id,
          channel,
          customerName: customers[(d.getDate() + i) % customers.length],
          invoiceNo: `INV-${dayKey.replace(/-/g, '')}-${i + 1}`,
          casesSold: cases,
          unitPrice,
          amount,
          remarks: 'Seeded sales entry',
        },
      });
      created += 1;
    }
  }

  console.log(`Created ${created} sales entries for ${ymd(monthStart)} → ${ymd(today)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
