import { Prisma, type SalesChannel } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import type { AuthUser } from '../middleware/auth.js';
import { calendarDateRange, toCalendarDate } from '../utils/dates.js';
import { ValidationError } from '../utils/errors.js';

function plantScope(user?: AuthUser): Prisma.SalesEntryWhereInput {
  if (!user) return {};
  if (user.role === 'PRODUCTION_MANAGER' && user.plantId) {
    return { plantId: user.plantId };
  }
  return {};
}

const CHANNEL_LABEL: Record<SalesChannel, string> = {
  DISTRIBUTOR: 'Distributor',
  RETAIL: 'Retail',
  MODERN_TRADE: 'Modern Trade',
  EXPORT: 'Export',
  OTHER: 'Other',
};

export async function getSalesDashboard(
  user?: AuthUser,
  filters?: { from?: string; to?: string; plantId?: string; channel?: string },
) {
  const { start, end } = calendarDateRange(filters?.from, filters?.to, 30);
  const where: Prisma.SalesEntryWhereInput = {
    deletedAt: null,
    saleDate: { gte: start, lte: end },
    ...plantScope(user),
    ...(filters?.plantId ? { plantId: filters.plantId } : {}),
    ...(filters?.channel ? { channel: filters.channel as SalesChannel } : {}),
  };

  const entries = await prisma.salesEntry.findMany({
    where,
    include: {
      plant: { select: { id: true, name: true, code: true } },
      brand: { select: { id: true, name: true, code: true } },
      product: { select: { id: true, name: true, code: true } },
      sku: { select: { id: true, code: true, name: true, packVolume: true } },
    },
    orderBy: [{ saleDate: 'asc' }, { createdAt: 'asc' }],
  });

  let totalCases = 0;
  let totalAmount = 0;
  let totalInvoices = 0;
  const invoiceSet = new Set<string>();
  const dailyMap = new Map<string, { cases: number; amount: number }>();
  const brandMap = new Map<string, { name: string; cases: number; amount: number }>();
  const skuMap = new Map<string, { name: string; cases: number; amount: number }>();
  const channelMap = new Map<string, { name: string; cases: number; amount: number }>();
  const productMap = new Map<string, { name: string; cases: number; amount: number }>();

  for (const e of entries) {
    const cases = Number(e.casesSold) || 0;
    const amount = Number(e.amount) || cases * (Number(e.unitPrice) || 0);
    totalCases += cases;
    totalAmount += amount;
    if (e.invoiceNo) invoiceSet.add(e.invoiceNo);
    else totalInvoices += 1;

    const date = toCalendarDate(e.saleDate);
    const day = dailyMap.get(date) ?? { cases: 0, amount: 0 };
    day.cases += cases;
    day.amount += amount;
    dailyMap.set(date, day);

    const brandName = e.brand?.name || e.product.name || 'Unbranded';
    const brand = brandMap.get(brandName) ?? { name: brandName, cases: 0, amount: 0 };
    brand.cases += cases;
    brand.amount += amount;
    brandMap.set(brandName, brand);

    const skuLabel = e.sku.packVolume || e.sku.code || e.sku.name;
    const sku = skuMap.get(skuLabel) ?? { name: skuLabel, cases: 0, amount: 0 };
    sku.cases += cases;
    sku.amount += amount;
    skuMap.set(skuLabel, sku);

    const chLabel = CHANNEL_LABEL[e.channel] || e.channel;
    const ch = channelMap.get(chLabel) ?? { name: chLabel, cases: 0, amount: 0 };
    ch.cases += cases;
    ch.amount += amount;
    channelMap.set(chLabel, ch);

    const prod = productMap.get(e.product.name) ?? { name: e.product.name, cases: 0, amount: 0 };
    prod.cases += cases;
    prod.amount += amount;
    productMap.set(e.product.name, prod);
  }

  const invoiceCount = invoiceSet.size || totalInvoices;
  const dayCount = dailyMap.size || 1;
  const avgDailyCases = Number((totalCases / dayCount).toFixed(1));
  const avgDailyAmount = Number((totalAmount / dayCount).toFixed(2));
  const avgUnitPrice = totalCases > 0 ? Number((totalAmount / totalCases).toFixed(2)) : 0;

  // Month target: 10% above month-to-date average run-rate as soft target display
  // (real targets can be wired later). Achievement vs prior period:
  const spanMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - spanMs);
  const prevAgg = await prisma.salesEntry.aggregate({
    where: {
      deletedAt: null,
      saleDate: { gte: prevStart, lte: prevEnd },
      ...plantScope(user),
      ...(filters?.plantId ? { plantId: filters.plantId } : {}),
      ...(filters?.channel ? { channel: filters.channel as SalesChannel } : {}),
    },
    _sum: { casesSold: true, amount: true },
  });
  const prevCases = Number(prevAgg._sum.casesSold ?? 0);
  const prevAmount = Number(prevAgg._sum.amount ?? 0);
  const casesGrowth =
    prevCases > 0 ? Number((((totalCases - prevCases) / prevCases) * 100).toFixed(1)) : totalCases > 0 ? 100 : 0;
  const amountGrowth =
    prevAmount > 0
      ? Number((((totalAmount - prevAmount) / prevAmount) * 100).toFixed(1))
      : totalAmount > 0
        ? 100
        : 0;

  const sortByAmount = (a: { amount: number }, b: { amount: number }) => b.amount - a.amount;

  return {
    from: toCalendarDate(start),
    to: toCalendarDate(end),
    kpis: {
      totalCases: Number(totalCases.toFixed(1)),
      totalAmount: Number(totalAmount.toFixed(2)),
      invoiceCount,
      entryCount: entries.length,
      avgDailyCases,
      avgDailyAmount,
      avgUnitPrice,
      prevCases: Number(prevCases.toFixed(1)),
      prevAmount: Number(prevAmount.toFixed(2)),
      casesGrowth,
      amountGrowth,
    },
    charts: {
      dailyTrend: [...dailyMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({
          date,
          cases: Number(v.cases.toFixed(1)),
          amount: Number(v.amount.toFixed(2)),
        })),
      byBrand: [...brandMap.values()]
        .sort(sortByAmount)
        .map((v) => ({
          name: v.name,
          cases: Number(v.cases.toFixed(1)),
          amount: Number(v.amount.toFixed(2)),
        })),
      bySku: [...skuMap.values()]
        .sort(sortByAmount)
        .slice(0, 10)
        .map((v) => ({
          name: v.name,
          cases: Number(v.cases.toFixed(1)),
          amount: Number(v.amount.toFixed(2)),
        })),
      byChannel: [...channelMap.values()]
        .sort(sortByAmount)
        .map((v) => ({
          name: v.name,
          cases: Number(v.cases.toFixed(1)),
          amount: Number(v.amount.toFixed(2)),
        })),
      byProduct: [...productMap.values()]
        .sort(sortByAmount)
        .slice(0, 10)
        .map((v) => ({
          name: v.name,
          cases: Number(v.cases.toFixed(1)),
          amount: Number(v.amount.toFixed(2)),
        })),
    },
    recent: entries
      .slice()
      .reverse()
      .slice(0, 25)
      .map((e) => ({
        id: e.id,
        saleDate: toCalendarDate(e.saleDate),
        plant: e.plant?.name || '—',
        brand: e.brand?.name || '—',
        product: e.product.name,
        sku: e.sku.packVolume || e.sku.code,
        channel: CHANNEL_LABEL[e.channel] || e.channel,
        customerName: e.customerName || '—',
        invoiceNo: e.invoiceNo || '—',
        casesSold: e.casesSold,
        unitPrice: e.unitPrice,
        amount: e.amount,
      })),
  };
}

export async function listSalesEntries(
  user?: AuthUser,
  filters?: { from?: string; to?: string; plantId?: string },
) {
  const { start, end } = calendarDateRange(filters?.from, filters?.to, 30);
  return prisma.salesEntry.findMany({
    where: {
      deletedAt: null,
      saleDate: { gte: start, lte: end },
      ...plantScope(user),
      ...(filters?.plantId ? { plantId: filters.plantId } : {}),
    },
    include: {
      plant: true,
      brand: true,
      product: true,
      sku: true,
    },
    orderBy: [{ saleDate: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  });
}

export async function createSalesEntry(
  data: {
    saleDate: string;
    plantId?: string | null;
    brandId?: string | null;
    productId: string;
    skuId: string;
    channel?: SalesChannel;
    customerName?: string | null;
    invoiceNo?: string | null;
    casesSold: number;
    unitPrice?: number;
    remarks?: string | null;
  },
  user?: AuthUser,
) {
  if (!data.productId || !data.skuId) throw new ValidationError('Product and SKU are required');
  if (!data.saleDate) throw new ValidationError('Sale date is required');
  const cases = Number(data.casesSold);
  if (!Number.isFinite(cases) || cases <= 0) throw new ValidationError('Cases sold must be greater than 0');
  const unitPrice = Math.max(0, Number(data.unitPrice) || 0);
  const amount = Number((cases * unitPrice).toFixed(2));

  const sku = await prisma.sku.findFirst({
    where: { id: data.skuId, deletedAt: null },
    include: { product: true },
  });
  if (!sku) throw new ValidationError('SKU not found');
  if (sku.productId !== data.productId) throw new ValidationError('SKU does not belong to selected product');

  const saleDate = new Date(`${data.saleDate.slice(0, 10)}T00:00:00.000Z`);

  return prisma.salesEntry.create({
    data: {
      saleDate,
      plantId: data.plantId || user?.plantId || null,
      brandId: data.brandId || sku.product.brandId || null,
      productId: data.productId,
      skuId: data.skuId,
      channel: data.channel || 'DISTRIBUTOR',
      customerName: data.customerName || null,
      invoiceNo: data.invoiceNo || null,
      casesSold: cases,
      unitPrice,
      amount,
      remarks: data.remarks || null,
      createdById: user?.id,
    },
    include: { plant: true, brand: true, product: true, sku: true },
  });
}

export async function softDeleteSalesEntry(id: string) {
  const existing = await prisma.salesEntry.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new ValidationError('Sales entry not found');
  return prisma.salesEntry.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function exportSalesExcel(
  user?: AuthUser,
  filters?: { from?: string; to?: string; plantId?: string; channel?: string },
) {
  const ExcelJS = (await import('exceljs')).default;
  const { start, end } = calendarDateRange(filters?.from, filters?.to, 30);
  const where: Prisma.SalesEntryWhereInput = {
    deletedAt: null,
    saleDate: { gte: start, lte: end },
    ...plantScope(user),
    ...(filters?.plantId ? { plantId: filters.plantId } : {}),
    ...(filters?.channel ? { channel: filters.channel as SalesChannel } : {}),
  };

  const entries = await prisma.salesEntry.findMany({
    where,
    include: {
      plant: { select: { name: true, code: true } },
      brand: { select: { name: true } },
      product: { select: { name: true } },
      sku: { select: { code: true, packVolume: true } },
    },
    orderBy: [{ saleDate: 'asc' }, { createdAt: 'asc' }],
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Nakshatra MES';
  const sheet = workbook.addWorksheet('Sales');
  sheet.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Plant', key: 'plant', width: 18 },
    { header: 'Brand', key: 'brand', width: 16 },
    { header: 'Product', key: 'product', width: 20 },
    { header: 'SKU', key: 'sku', width: 14 },
    { header: 'Channel', key: 'channel', width: 14 },
    { header: 'Customer', key: 'customer', width: 20 },
    { header: 'Invoice', key: 'invoice', width: 18 },
    { header: 'Cases', key: 'cases', width: 12 },
    { header: 'Unit Price', key: 'unitPrice', width: 12 },
    { header: 'Amount', key: 'amount', width: 14 },
    { header: 'Remarks', key: 'remarks', width: 24 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const e of entries) {
    sheet.addRow({
      date: toCalendarDate(e.saleDate),
      plant: e.plant?.name || e.plant?.code || '',
      brand: e.brand?.name || '',
      product: e.product.name,
      sku: e.sku.packVolume || e.sku.code,
      channel: CHANNEL_LABEL[e.channel] || e.channel,
      customer: e.customerName || '',
      invoice: e.invoiceNo || '',
      cases: e.casesSold,
      unitPrice: e.unitPrice,
      amount: e.amount,
      remarks: e.remarks || '',
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
