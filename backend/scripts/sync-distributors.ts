/**
 * Build distributor master from unique sales_entries.customerName values
 * (day-book parties), merge duplicates, and backfill sales_entries.distributorId.
 *
 * Run from backend: npx tsx scripts/sync-distributors.ts
 */
import { PrismaClient } from '@prisma/client';
import {
  canonicalDistributorKey,
  cleanDistributorArea,
  displayDistributorName,
  titleCaseName,
} from '../src/utils/distributorName.ts';

const prisma = new PrismaClient();

const SKIP =
  /^(retail|free\b|credit|total|s\.?\s*no|name|vender name|particulars|purtculars|cash|counter|old due|advance)$/i;

type Parsed = { name: string; phone: string | null; area: string | null };

function slugCode(s: string, max = 40) {
  return (
    s
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, max) || `X-${Date.now()}`
  );
}

function isPhoneToken(s: string) {
  const digits = s.replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 12 && digits.startsWith('91'));
}

function toPhone(s: string) {
  const digits = s.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits.length === 10 ? digits : null;
}

function parseParty(raw: string): Parsed | null {
  let text = String(raw || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\(\s*/g, ' (')
    .replace(/\s*\)\s*/g, ') ')
    .trim();
  if (!text) return null;
  if (SKIP.test(text)) return null;
  if (/^free\b/i.test(text)) return null;

  const parens = [...text.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim()).filter(Boolean);
  let rest = text.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();

  let phone: string | null = null;
  const areas: string[] = [];
  for (const p of parens) {
    if (!phone && isPhoneToken(p)) phone = toPhone(p);
    else areas.push(p);
  }

  const trailingPhone = rest.match(/(\+?91[-\s]?)?[6-9]\d{9}$/);
  if (trailingPhone && !phone) {
    phone = toPhone(trailingPhone[0]);
    rest = rest.slice(0, trailingPhone.index).trim();
  }

  const name = displayDistributorName(rest.replace(/[-–]+$/g, '').trim());
  if (!name || name.length < 2) return null;
  if (SKIP.test(name)) return null;

  const area = cleanDistributorArea(areas.join(', '));
  return { name, phone, area };
}

function partyKey(p: Parsed) {
  return canonicalDistributorKey(p.name);
}

async function uniqueCode(base: string) {
  let code = base;
  for (let n = 2; n < 80; n += 1) {
    const clash = await prisma.distributor.findUnique({ where: { code } });
    if (!clash) return code;
    code = `${base.slice(0, 36)}-${n}`;
  }
  return `${base.slice(0, 30)}-${Date.now().toString().slice(-8)}`;
}

async function mergeDuplicates() {
  const rows = await prisma.distributor.findMany({
    where: { deletedAt: null },
    include: { _count: { select: { salesEntries: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const groups = new Map<string, typeof rows>();
  for (const d of rows) {
    const key = canonicalDistributorKey(d.name);
    if (!key) continue;
    const g = groups.get(key) ?? [];
    g.push(d);
    groups.set(key, g);
  }

  let merged = 0;
  let renamed = 0;

  for (const [key, group] of groups) {
    const ranked = [...group].sort((a, b) => {
      const sales = b._count.salesEntries - a._count.salesEntries;
      if (sales) return sales;
      if (Boolean(b.phone) !== Boolean(a.phone)) return a.phone ? -1 : 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const keeper = ranked[0];
    const display = displayDistributorName(keeper.name) || titleCaseName(key);
    const phone = ranked.find((d) => d.phone)?.phone || null;
    const area =
      ranked.map((d) => cleanDistributorArea(d.area)).find(Boolean) ||
      cleanDistributorArea(keeper.area);

    const extras = ranked.slice(1);
    for (const extra of extras) {
      await prisma.salesEntry.updateMany({
        where: { distributorId: extra.id },
        data: { distributorId: keeper.id },
      });
      await prisma.distributor.update({
        where: { id: extra.id },
        data: { deletedAt: new Date(), isActive: false },
      });
      merged += 1;
    }

    const patch: { name?: string; phone?: string | null; area?: string | null } = {};
    if (keeper.name !== display) patch.name = display;
    if (!keeper.phone && phone) patch.phone = phone;
    if (area && keeper.area !== area) patch.area = area;
    if (Object.keys(patch).length) {
      await prisma.distributor.update({ where: { id: keeper.id }, data: patch });
      renamed += 1;
    }
  }

  return { merged, renamed, remaining: groups.size };
}

async function main() {
  const dedupe = await mergeDuplicates();

  const names = await prisma.salesEntry.findMany({
    where: { deletedAt: null, customerName: { not: null } },
    select: { customerName: true },
    distinct: ['customerName'],
  });

  const groups = new Map<string, Parsed & { raws: string[] }>();
  let skipped = 0;
  for (const row of names) {
    const raw = row.customerName || '';
    const parsed = parseParty(raw);
    if (!parsed) {
      skipped += 1;
      continue;
    }
    const key = partyKey(parsed);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { ...parsed, raws: [raw] });
      continue;
    }
    existing.raws.push(raw);
    if (!existing.phone && parsed.phone) existing.phone = parsed.phone;
    if (!existing.area && parsed.area) existing.area = parsed.area;
    if (parsed.name.length > existing.name.length) existing.name = parsed.name;
  }

  const existingRows = await prisma.distributor.findMany({ where: { deletedAt: null } });
  const byKey = new Map<string, (typeof existingRows)[number]>();
  for (const d of existingRows) {
    byKey.set(canonicalDistributorKey(d.name), d);
  }

  let created = 0;
  let updated = 0;
  const idByKey = new Map<string, string>();

  for (const [key, party] of groups) {
    const found = byKey.get(key);
    const name = displayDistributorName(party.name);
    const area = cleanDistributorArea(party.area);
    if (found) {
      const patch: { phone?: string; area?: string; name?: string } = {};
      if (!found.phone && party.phone) patch.phone = party.phone;
      if (!found.area && area) patch.area = area;
      if (found.name !== name) patch.name = name;
      if (Object.keys(patch).length) {
        await prisma.distributor.update({ where: { id: found.id }, data: patch });
        updated += 1;
      }
      idByKey.set(key, found.id);
      continue;
    }
    const code = await uniqueCode(`DST-${slugCode(name)}`);
    const item = await prisma.distributor.create({
      data: {
        code,
        name,
        phone: party.phone,
        area,
        isActive: true,
      },
    });
    created += 1;
    idByKey.set(key, item.id);
    byKey.set(key, item);
  }

  const sales = await prisma.salesEntry.findMany({
    where: { deletedAt: null },
    select: { id: true, customerName: true, distributorId: true },
  });

  let linked = 0;
  for (const row of sales) {
    const parsed = parseParty(row.customerName || '');
    if (!parsed) continue;
    const id = idByKey.get(partyKey(parsed));
    if (!id || row.distributorId === id) continue;
    await prisma.salesEntry.update({
      where: { id: row.id },
      data: { distributorId: id },
    });
    linked += 1;
  }

  console.log(
    JSON.stringify(
      {
        mergedDuplicates: dedupe.merged,
        cleanedNames: dedupe.renamed,
        remaining: dedupe.remaining,
        uniqueNames: names.length,
        skippedNonParties: skipped,
        distributors: groups.size,
        created,
        updated,
        salesLinked: linked,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
