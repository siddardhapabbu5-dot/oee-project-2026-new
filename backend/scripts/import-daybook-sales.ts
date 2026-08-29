/**
 * Import August 2026 day-book Excel into sales_entries.
 * Source: Desktop/AUGEST DAY BOOK 2026.xlsx
 */
import ExcelJS from 'exceljs';
import { PrismaClient, type SalesChannel } from '@prisma/client';

const prisma = new PrismaClient();
const FILE = 'C:/Users/harsh/OneDrive/Documents/Desktop/AUGEST DAY BOOK 2026.xlsx';

const STOP =
  /old due|final report|today expenditure|advance paid|vender name|counter cash|production data|denomination/i;

const SKIP_NAME = /^(credit|total|s\.?no|name|vender name|particulars|purtculars)$/i;

type PackKey = '1L' | '500ML' | '250ML' | 'SODA';

const PACK_COLS: Array<{ pack: PackKey; brand: number; qty: number; rate: number }> = [
  { pack: '1L', brand: 3, qty: 4, rate: 5 },
  { pack: '500ML', brand: 7, qty: 8, rate: 9 },
  { pack: 'SODA', brand: 11, qty: 12, rate: 13 },
  { pack: '250ML', brand: 15, qty: 16, rate: 17 },
];

const ALIASES: Array<{ match: RegExp; brand: string }> = [
  { match: /ice\s*burg\s*green|ice\s*burge\s*green|iceburg\s*green|ib\s*green|ice\s*gree+n|lice\s*green|icegreen/i, brand: 'ICE BURG GREEN' },
  { match: /ice\s*burg\s*black|ice\s*black/i, brand: 'ICE BURG BLACK' },
  { match: /lavin\s*ora+nge/i, brand: 'LAVIN ORANGE' },
  { match: /lavin\s*white/i, brand: 'LAVIN WHITE' },
  { match: /imperial\s*blue|imperal\s*blue|im\s*perial\s*blue/i, brand: 'IMPERIAL BLUE' },
  { match: /golden\s*drop|gloden\s*drop|custimi[sz]e\s*golden/i, brand: 'GOLDEN DROP' },
  { match: /mansion\s*house|manshion\s*house/i, brand: 'MANSION HOUSE' },
  { match: /b\s*2\s*white|b2white/i, brand: 'B2 WHITE' },
  { match: /b\s*2\s*blue|b2blue/i, brand: 'B2 BLUE' },
  { match: /dp\s*school|d\.?\s*p\.?\s*school/i, brand: 'DP SCHOOL' },
  { match: /ed\s*school|edify/i, brand: 'ED SCHOOL' },
  { match: /function|events|gk events|jk events|tej events/i, brand: 'FUNCTION EVENTS' },
  { match: /natural/i, brand: 'NATURAL' },
  { match: /smart/i, brand: 'SMART' },
  { match: /\blavin\b|\blavn\b|\blavimn\b/i, brand: 'LAVIN' },
  { match: /\bsoda\b/i, brand: 'SODA' },
  { match: /\bib\b/i, brand: 'IMPERIAL BLUE' },
];

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value as unknown;
  if (v == null) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return v.replace(/\s+/g, ' ').trim();
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.result === 'number' || typeof o.result === 'string') return String(o.result).trim();
    if (typeof o.text === 'string') return o.text.replace(/\s+/g, ' ').trim();
    if (Array.isArray(o.richText)) {
      return (o.richText as Array<{ text?: string }>).map((x) => x.text || '').join('').replace(/\s+/g, ' ').trim();
    }
  }
  return '';
}

function cellNum(cell: ExcelJS.Cell): number {
  const v = cell.value as unknown;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'object' && v && 'result' in v) {
    const r = (v as { result?: unknown }).result;
    if (typeof r === 'number' && Number.isFinite(r)) return r;
    if (typeof r === 'string') {
      const n = Number(r.replace(/[₹,\s]/g, ''));
      if (Number.isFinite(n)) return n;
    }
  }
  const t = cellText(cell).replace(/[₹,\s]/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function sheetDate(name: string): string | null {
  const m = name.trim().match(/^AUGEST-(\d+)/i);
  if (!m) return null;
  const day = String(Number(m[1])).padStart(2, '0');
  return `2026-08-${day}`;
}

function canonicalBrand(raw: string): string | null {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!s) return null;
  for (const a of ALIASES) {
    if (a.match.test(s)) return a.brand;
  }
  return null;
}

function splitBrandQty(raw: string, fallbackQty: number): Array<{ brand: string; qty: number }> {
  let text = raw.replace(/\([^)]*\)/g, ' ').replace(/customise|customize|custimize|exchange|free case|free|mixed cases|mixed/gi, ' ');
  text = text.replace(/([A-Za-z])(\d)/g, '$1 $2');
  text = text.replace(/\s+/g, ' ').trim();
  if (!text) return [];

  const single = canonicalBrand(text);
  const looksMixed = /[/&,+]|\d/.test(text) && (text.includes('/') || text.includes(',') || text.includes('&') || /\d/.test(text));
  if (single && !looksMixed) return [{ brand: single, qty: fallbackQty }];
  if (single && !/\d/.test(text.replace(/2\s*l|23|22|pack/gi, ''))) return [{ brand: single, qty: fallbackQty }];

  const parts = text.split(/[/&,+]+/).map((p) => p.trim()).filter(Boolean);
  const out: Array<{ brand: string; qty: number }> = [];
  for (const part of parts) {
    let brand: string | null = null;
    let rest = part;
    const sorted = [...ALIASES].sort((a, b) => b.match.source.length - a.match.source.length);
    for (const a of sorted) {
      const m = part.match(a.match);
      if (m) {
        brand = a.brand;
        rest = part.replace(m[0], ' ');
        break;
      }
    }
    const nums = rest.match(/(\d+(?:\.\d+)?)/g);
    const qty = nums ? Number(nums[nums.length - 1]) : NaN;
    if (brand && Number.isFinite(qty) && qty > 0 && qty <= 2500) out.push({ brand, qty });
    else if (brand && (!nums || nums.length === 0) && fallbackQty > 0) out.push({ brand, qty: fallbackQty });
  }
  if (out.length) return out;
  if (single && fallbackQty > 0) return [{ brand: single, qty: fallbackQty }];
  return [];
}

type SkuHit = { id: string; productId: string; brandId: string | null };

async function main() {
  const plant = await prisma.plant.findFirst({ where: { deletedAt: null } });
  const admin = await prisma.user.findFirst({ where: { email: 'admin@pms.local', deletedAt: null } });
  const skus = await prisma.sku.findMany({
    where: { deletedAt: null },
    include: { product: { include: { brand: true } } },
  });

  let sodaSku = skus.find(
    (s) => /soda/i.test(s.product.name) || /soda/i.test(s.packVolume || '') || /soda/i.test(s.name || ''),
  );
  if (!sodaSku) {
    const sodaProduct = await prisma.product.findFirst({
      where: { deletedAt: null, name: { contains: 'Soda', mode: 'insensitive' } },
    });
    if (sodaProduct) {
      sodaSku = await prisma.sku.create({
        data: {
          code: 'SKU-SODA',
          name: 'Sparkling Soda',
          packVolume: 'Soda',
          packSize: 24,
          productId: sodaProduct.id,
          isActive: true,
        },
        include: { product: { include: { brand: true } } },
      });
      skus.push(sodaSku);
      console.log('Created SKU-SODA');
    }
  }

  async function ensureSku(code: string, productName: string, packVolume: string, packSize: number) {
    const existing = skus.find((s) => s.code === code);
    if (existing) return existing;
    const product = await prisma.product.findFirst({
      where: { deletedAt: null, name: { equals: productName, mode: 'insensitive' } },
    });
    if (!product) return null;
    const created = await prisma.sku.create({
      data: { code, name: `${productName} ${packVolume}`, packVolume, packSize, productId: product.id, isActive: true },
      include: { product: { include: { brand: true } } },
    });
    skus.push(created);
    console.log(`Created ${code}`);
    return created;
  }

  await ensureSku('SKU-ICE-BURG-GREEN-250-ML', 'Ice Burg Green', '250 ML', 30);
  await ensureSku('SKU-LAVIN-WHITE-1000-ML', 'Lavin White', '1000 ML', 12);

  function findSku(brand: string, pack: PackKey): SkuHit | null {
    const packVol =
      pack === '1L' ? '1000 ML' : pack === '500ML' ? '500 ML' : pack === '250ML' ? '250 ML' : 'SODA';
    const candidates = skus.filter((s) => {
      const vol = (s.packVolume || '').toUpperCase().replace(/\s+/g, ' ');
      if (pack === 'SODA') return /soda/i.test(s.product.name) || /soda/i.test(vol);
      if (pack === '1L') return vol.includes('1000') || vol === '1 L' || vol === '1L';
      if (pack === '500ML') return vol.includes('500');
      if (pack === '250ML') return vol.includes('250');
      return false;
    });

    const want = (names: string[]) =>
      candidates.find((s) => {
        const hay = `${s.product.brand?.name || ''} ${s.product.name} ${s.name}`.toUpperCase();
        return names.every((n) => hay.includes(n.toUpperCase()));
      });

    let hit =
      brand === 'LAVIN ORANGE'
        ? want(['LAVIN', 'ORANGE'])
        : brand === 'LAVIN WHITE'
          ? want(['LAVIN', 'WHITE'])
          : brand === 'LAVIN'
            ? want(['LAVIN', 'ORANGE']) || want(['LAVIN'])
            : brand === 'ICE BURG GREEN'
              ? want(['ICE', 'GREEN']) || want(['ICE BURG GREEN'])
              : brand === 'ICE BURG BLACK'
                ? want(['ICE', 'BLACK'])
                : brand === 'GOLDEN DROP'
                  ? want(['GOLDEN DROP']) || want(['GLODEN DROP'])
                  : brand === 'B2 WHITE'
                    ? want(['B2', 'WHITE'])
                    : brand === 'B2 BLUE'
                      ? want(['B2', 'BLUE'])
                      : brand === 'NATURAL'
                        ? want(['NATURAL'])
                        : brand === 'SMART'
                          ? want(['SMART', 'WHITE']) || want(['SMART'])
                          : brand === 'IMPERIAL BLUE'
                            ? want(['IMPERIAL'])
                            : brand === 'MANSION HOUSE'
                              ? want(['MANSION'])
                              : brand === 'DP SCHOOL'
                                ? want(['DP SCHOOL'])
                                : brand === 'ED SCHOOL'
                                  ? want(['ED SCHOOL'])
                                  : brand === 'FUNCTION EVENTS'
                                    ? want(['FUNCTION']) || want(['EVENT'])
                                    : brand === 'SODA'
                                      ? sodaSku
                                      : null;

    if (!hit && pack === 'SODA') hit = sodaSku || null;
    if (!hit) return null;
    return { id: hit.id, productId: hit.productId, brandId: hit.product.brandId };
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);

  const rows: Array<{
    saleDate: string;
    customerName: string;
    brandLabel: string;
    pack: PackKey;
    qty: number;
    rate: number;
    channel: SalesChannel;
    sku: SkuHit;
    remarks: string | null;
  }> = [];
  const skipped: string[] = [];

  for (const ws of wb.worksheets) {
    const saleDate = sheetDate(ws.name);
    if (!saleDate) continue;

    for (let r = 3; r <= (ws.rowCount || 0); r++) {
      const row = ws.getRow(r);
      const name = cellText(row.getCell(2)) || cellText(row.getCell(1));
      const joined = `${cellText(row.getCell(1))} ${name}`;
      if (STOP.test(joined)) break;
      if (!name || SKIP_NAME.test(name.trim())) continue;
      if (/^free\b/i.test(name) && PACK_COLS.every((c) => cellNum(row.getCell(c.qty)) <= 0)) continue;

      const channel: SalesChannel = /retail/i.test(name) ? 'RETAIL' : 'DISTRIBUTOR';

      for (const col of PACK_COLS) {
        const brandRaw = cellText(row.getCell(col.brand));
        const qtyCell = cellNum(row.getCell(col.qty));
        const rate = cellNum(row.getCell(col.rate));
        if ((!qtyCell || qtyCell <= 0) && !brandRaw) continue;
        if (!brandRaw && qtyCell > 2500) continue;
        if (!brandRaw && qtyCell <= 0) continue;
        const effectiveBrand = brandRaw || (col.pack === 'SODA' ? 'SODA' : '');

        const pieces = splitBrandQty(effectiveBrand, qtyCell);
        if (!pieces.length) {
          if (qtyCell > 0 && qtyCell <= 2500) skipped.push(`${saleDate} | ${name} | ${brandRaw || '(blank)'} | ${col.pack} x ${qtyCell}`);
          continue;
        }
        for (const piece of pieces) {
          if (piece.qty <= 0 || piece.qty > 2500) continue;
          const sku = findSku(piece.brand, col.pack);
          if (!sku) {
            skipped.push(`${saleDate} | ${name} | ${piece.brand} | ${col.pack} x ${piece.qty} (no SKU)`);
            continue;
          }
          const unitPrice = rate > 0 && rate < 1000 ? Number(rate.toFixed(2)) : 0;
          rows.push({
            saleDate,
            customerName: name.slice(0, 180),
            brandLabel: piece.brand,
            pack: col.pack,
            qty: piece.qty,
            rate: unitPrice,
            channel,
            sku,
            remarks: brandRaw && brandRaw !== piece.brand ? brandRaw.slice(0, 200) : null,
          });
        }
      }
    }
  }

  const augustStart = new Date('2026-08-01T00:00:00.000Z');
  const augustEnd = new Date('2026-08-31T23:59:59.999Z');
  const deleted = await prisma.salesEntry.deleteMany({
    where: { saleDate: { gte: augustStart, lte: augustEnd } },
  });

  let created = 0;
  for (const rec of rows) {
    const amount = Number((rec.qty * rec.rate).toFixed(2));
    await prisma.salesEntry.create({
      data: {
        saleDate: new Date(`${rec.saleDate}T00:00:00.000Z`),
        plantId: plant?.id ?? null,
        brandId: rec.sku.brandId,
        productId: rec.sku.productId,
        skuId: rec.sku.id,
        channel: rec.channel,
        customerName: rec.customerName,
        invoiceNo: null,
        casesSold: rec.qty,
        unitPrice: rec.rate,
        amount,
        remarks: rec.remarks,
        createdById: admin?.id ?? null,
      },
    });
    created += 1;
  }

  const byDay = new Map<string, number>();
  for (const rec of rows) byDay.set(rec.saleDate, (byDay.get(rec.saleDate) || 0) + 1);

  console.log(`Removed ${deleted.count} existing August 2026 sales`);
  console.log(`Imported ${created} sales entries from day book`);
  console.log('By day:');
  for (const [d, n] of [...byDay.entries()].sort()) console.log(`  ${d}  ${n}`);
  console.log(`Skipped ${skipped.length}`);
  for (const s of skipped.slice(0, 40)) console.log(`  skip: ${s}`);
  if (skipped.length > 40) console.log(`  ... ${skipped.length - 40} more`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
