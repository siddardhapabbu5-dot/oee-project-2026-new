import { Prisma, type CaseBookingStatus, type PaymentMode, type SalesChannel } from '@prisma/client';
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

const PAYMENT_LABEL: Record<PaymentMode, string> = {
  CASH: 'Cash',
  CREDIT: 'Credit',
  ADVANCE: 'Advance',
};

function slugCode(s: string) {
  return s
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36);
}

function packSizeFromVolume(volume?: string | null) {
  const v = (volume || '').toUpperCase().replace(/\s+/g, '');
  if (v.includes('2000ML') || v.includes('2L') || v === '2000') return 6;
  if (v.includes('1000ML') || v.includes('1L') || v === '1000') return 12;
  if (v.includes('750ML') || v === '750') return 12;
  if (v.includes('500ML') || v === '500') return 24;
  if (v.includes('300ML') || v === '300') return 24;
  if (v.includes('250ML') || v === '250') return 30;
  if (v.includes('200ML') || v === '200') return 36;
  if (v.includes('20L') || v.includes('JAR')) return 1;
  return null;
}

function packKey(raw?: string | null) {
  const v = (raw || '').toUpperCase().replace(/\s+/g, '');
  if (!v) return '';
  if (v.includes('JAR') || /(^|[^0-9])20L/.test(v)) return 'JAR-20L';
  const m = v.match(/(2000|1000|750|500|300|250|200)ML/) || v.match(/(2000|1000|750|500|300|250|200)/);
  return m ? `${m[1]}ML` : v;
}

async function skuForProductPack(productId: string, template: {
  id: string;
  productId: string;
  code: string;
  name: string;
  packVolume?: string | null;
  packSize?: number | null;
  bottlesPerHour?: number | null;
}) {
  if (template.productId === productId) return template;

  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!product) throw new ValidationError('Product not found');

  const key = packKey(template.packVolume || template.name || template.code);
  const existing = await prisma.sku.findMany({
    where: { productId, deletedAt: null },
  });
  const match = existing.find(
    (s) => packKey(s.packVolume || s.name || s.code) === key && key !== '',
  );
  if (match) return match;

  const packLabel =
    template.packVolume ||
    (key === 'JAR-20L' ? 'Jar-20L' : key.endsWith('ML') ? `${key.replace('ML', '')} ML` : template.name);
  const base = `SKU-${slugCode(product.name)}-${slugCode(packLabel)}` || `SKU-${Date.now()}`;
  let code = base;
  for (let n = 2; n < 50; n += 1) {
    const clash = await prisma.sku.findUnique({ where: { code } });
    if (!clash) break;
    code = `${base.slice(0, 36)}-${n}`;
  }

  return prisma.sku.create({
    data: {
      code,
      name: `${product.name}-${packLabel}`,
      productId,
      packVolume: packLabel,
      packSize: template.packSize && template.packSize > 0 ? template.packSize : packSizeFromVolume(packLabel),
      bottlesPerHour: template.bottlesPerHour && template.bottlesPerHour > 0 ? template.bottlesPerHour : 5400,
      isActive: true,
    },
  });
}

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
        paymentMode: PAYMENT_LABEL[e.paymentMode] || e.paymentMode,
        casesSold: e.casesSold,
        unitPrice: e.unitPrice,
        amount: e.amount,
      })),
  };
}

export async function listSalesEntries(
  user?: AuthUser,
  filters?: { from?: string; to?: string; plantId?: string; channel?: string },
) {
  const { start, end } = calendarDateRange(filters?.from, filters?.to, 30);
  return prisma.salesEntry.findMany({
    where: {
      deletedAt: null,
      saleDate: { gte: start, lte: end },
      ...plantScope(user),
      ...(filters?.plantId ? { plantId: filters.plantId } : {}),
      ...(filters?.channel ? { channel: filters.channel as SalesChannel } : {}),
    },
    include: {
      plant: true,
      brand: true,
      product: true,
      sku: true,
      distributor: { select: { id: true, name: true, phone: true, area: true } },
    },
    orderBy: [{ saleDate: 'desc' }, { createdAt: 'desc' }],
    take: 2000,
  });
}

export async function createSalesEntry(
  data: {
    saleDate: string;
    plantId?: string | null;
    brandId?: string | null;
    productId: string;
    skuId: string;
    distributorId?: string | null;
    channel?: SalesChannel;
    customerName?: string | null;
    invoiceNo?: string | null;
    paymentMode?: PaymentMode;
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

  const template = await prisma.sku.findFirst({
    where: { id: data.skuId, deletedAt: null },
  });
  if (!template) throw new ValidationError('SKU not found');
  const selectedProduct = await prisma.product.findFirst({
    where: { id: data.productId, deletedAt: null },
    select: { id: true, brandId: true },
  });
  if (!selectedProduct) throw new ValidationError('Product not found');
  const sku = await skuForProductPack(selectedProduct.id, template);

  let distributorId = data.distributorId || null;
  let customerName = data.customerName?.trim() || null;
  if (distributorId) {
    const dist = await prisma.distributor.findFirst({ where: { id: distributorId, deletedAt: null } });
    if (!dist) throw new ValidationError('Distributor not found');
    if (!customerName) customerName = dist.name;
  } else if (customerName) {
    const dist = await prisma.distributor.findFirst({
      where: { deletedAt: null, name: { equals: customerName, mode: 'insensitive' } },
    });
    if (dist) {
      distributorId = dist.id;
      customerName = dist.name;
    }
  }

  const saleDate = new Date(`${data.saleDate.slice(0, 10)}T00:00:00.000Z`);

  return prisma.salesEntry.create({
    data: {
      saleDate,
      plantId: data.plantId || user?.plantId || null,
      brandId: data.brandId || selectedProduct.brandId || null,
      productId: selectedProduct.id,
      skuId: sku.id,
      distributorId,
      channel: data.channel || 'DISTRIBUTOR',
      customerName,
      invoiceNo: data.invoiceNo || null,
      paymentMode: data.paymentMode || 'CASH',
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
    { header: 'Payment', key: 'payment', width: 12 },
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
      payment: PAYMENT_LABEL[e.paymentMode] || e.paymentMode,
      cases: e.casesSold,
      unitPrice: e.unitPrice,
      amount: e.amount,
      remarks: e.remarks || '',
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function bookingPlantScope(user?: AuthUser): Prisma.CaseBookingWhereInput {
  if (!user) return {};
  if (user.role === 'PRODUCTION_MANAGER' && user.plantId) {
    return { plantId: user.plantId };
  }
  return {};
}

const BOOKING_INCLUDE = {
  plant: true,
  brand: true,
  product: true,
  sku: true,
  distributor: { select: { id: true, name: true, phone: true, area: true } },
} as const;

async function resolveSalesParty(data: { distributorId?: string | null; customerName?: string | null }) {
  let distributorId = data.distributorId || null;
  let customerName = data.customerName?.trim() || null;
  if (distributorId) {
    const dist = await prisma.distributor.findFirst({ where: { id: distributorId, deletedAt: null } });
    if (!dist) throw new ValidationError('Distributor not found');
    if (!customerName) customerName = dist.name;
  } else if (customerName) {
    const dist = await prisma.distributor.findFirst({
      where: { deletedAt: null, name: { equals: customerName, mode: 'insensitive' } },
    });
    if (dist) {
      distributorId = dist.id;
      customerName = dist.name;
    }
  }
  return { distributorId, customerName };
}

export async function listCaseBookings(
  user?: AuthUser,
  filters?: { from?: string; to?: string; status?: string; plantId?: string },
) {
  const { start, end } = calendarDateRange(filters?.from, filters?.to, 30);
  const status = filters?.status as CaseBookingStatus | undefined;
  return prisma.caseBooking.findMany({
    where: {
      deletedAt: null,
      ...bookingPlantScope(user),
      ...(filters?.plantId ? { plantId: filters.plantId } : {}),
      ...(status ? { status } : {}),
      OR: [{ bookingDate: { gte: start, lte: end } }, { deliveryDate: { gte: start, lte: end } }],
    },
    include: BOOKING_INCLUDE,
    orderBy: [{ deliveryDate: 'asc' }, { bookingDate: 'desc' }, { createdAt: 'desc' }],
    take: 2000,
  });
}

export async function createCaseBooking(
  data: {
    bookingDate: string;
    deliveryDate: string;
    plantId?: string | null;
    brandId?: string | null;
    productId: string;
    skuId: string;
    distributorId?: string | null;
    customerName?: string | null;
    casesBooked: number;
    unitPrice?: number;
    remarks?: string | null;
  },
  user?: AuthUser,
) {
  if (!data.productId || !data.skuId) throw new ValidationError('Product and SKU are required');
  if (!data.bookingDate) throw new ValidationError('Booking date is required');
  if (!data.deliveryDate) throw new ValidationError('Delivery date is required');
  const cases = Number(data.casesBooked);
  if (!Number.isFinite(cases) || cases <= 0) throw new ValidationError('Cases booked must be greater than 0');
  const unitPrice = Math.max(0, Number(data.unitPrice) || 0);
  const amount = Number((cases * unitPrice).toFixed(2));

  const template = await prisma.sku.findFirst({
    where: { id: data.skuId, deletedAt: null },
  });
  if (!template) throw new ValidationError('SKU not found');
  const selectedProduct = await prisma.product.findFirst({
    where: { id: data.productId, deletedAt: null },
    select: { id: true, brandId: true },
  });
  if (!selectedProduct) throw new ValidationError('Product not found');
  const sku = await skuForProductPack(selectedProduct.id, template);
  const { distributorId, customerName } = await resolveSalesParty(data);

  return prisma.caseBooking.create({
    data: {
      bookingDate: new Date(`${data.bookingDate.slice(0, 10)}T00:00:00.000Z`),
      deliveryDate: new Date(`${data.deliveryDate.slice(0, 10)}T00:00:00.000Z`),
      plantId: data.plantId || user?.plantId || null,
      brandId: data.brandId || selectedProduct.brandId || null,
      productId: selectedProduct.id,
      skuId: sku.id,
      distributorId,
      customerName,
      casesBooked: cases,
      unitPrice,
      amount,
      status: 'BOOKED',
      remarks: data.remarks || null,
      createdById: user?.id,
    },
    include: BOOKING_INCLUDE,
  });
}

export async function deliverCaseBooking(id: string, user?: AuthUser) {
  const booking = await prisma.caseBooking.findFirst({
    where: { id, deletedAt: null },
    include: BOOKING_INCLUDE,
  });
  if (!booking) throw new ValidationError('Booking not found');
  if (booking.status === 'CANCELLED') throw new ValidationError('Cancelled booking cannot be delivered');
  if (booking.status === 'DELIVERED' && booking.salesEntryId) return booking;

  const now = new Date();
  const saleDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const sale = await createSalesEntry(
    {
      saleDate,
      plantId: booking.plantId,
      brandId: booking.brandId,
      productId: booking.productId,
      skuId: booking.skuId,
      distributorId: booking.distributorId,
      customerName: booking.customerName,
      channel: 'DISTRIBUTOR',
      paymentMode: 'ADVANCE',
      casesSold: booking.casesBooked,
      unitPrice: booking.unitPrice,
      remarks: booking.remarks ? `Advance booking: ${booking.remarks}` : 'Advance case booking',
    },
    user,
  );

  return prisma.caseBooking.update({
    where: { id },
    data: { status: 'DELIVERED', salesEntryId: sale.id },
    include: BOOKING_INCLUDE,
  });
}

export async function cancelCaseBooking(id: string) {
  const booking = await prisma.caseBooking.findFirst({ where: { id, deletedAt: null } });
  if (!booking) throw new ValidationError('Booking not found');
  if (booking.status === 'DELIVERED') throw new ValidationError('Delivered booking cannot be cancelled');
  return prisma.caseBooking.update({
    where: { id },
    data: { status: 'CANCELLED' },
    include: BOOKING_INCLUDE,
  });
}

export async function softDeleteCaseBooking(id: string) {
  const existing = await prisma.caseBooking.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new ValidationError('Booking not found');
  if (existing.status === 'DELIVERED') throw new ValidationError('Delivered booking cannot be deleted');
  return prisma.caseBooking.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
