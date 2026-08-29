import { prisma } from '../config/prisma.js';
import type { AuthUser } from '../middleware/auth.js';
import { calendarDateRange, toCalendarDate } from '../utils/dates.js';
import { ValidationError } from '../utils/errors.js';

export const PETTY_CASH_CATEGORIES = [
  'Opening Balance',
  'Petty Cash Advance',
  'Tea & Refreshments',
  'Travel & Local Conveyance',
  'Fuel',
  'Stationery',
  'Repairs & Maintenance',
  'Packing Materials',
  'Cleaning Expenses',
  'Mobile & Internet',
  'Factory Expenses',
  'Miscellaneous',
] as const;

export const INFLOW_CATEGORIES = ['Opening Balance', 'Petty Cash Advance'] as const;

export type PettyCashCategory = (typeof PETTY_CASH_CATEGORIES)[number];

type EntryInput = {
  entryDate: string;
  voucherNo?: string | null;
  category: string;
  description: string;
  received?: number;
  paid?: number;
  approvedBy?: string | null;
  remarks?: string | null;
  plantId?: string | null;
  attachment?: { originalName: string; mime: string; storedName: string } | null;
};

function money(n: unknown) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

async function nextVoucherNo() {
  const last = await prisma.pettyCashEntry.findFirst({
    where: { voucherNo: { startsWith: 'PC-' } },
    orderBy: { voucherNo: 'desc' },
    select: { voucherNo: true },
  });
  const n = last?.voucherNo?.match(/^PC-(\d+)$/i);
  const next = n ? Number(n[1]) + 1 : 1;
  return `PC-${String(next).padStart(3, '0')}`;
}

function withBalance<T extends { received: number; paid: number }>(rows: T[]) {
  let balance = 0;
  return rows.map((row) => {
    balance = money(balance + money(row.received) - money(row.paid));
    return { ...row, balance };
  });
}

export async function listPettyCash(
  user?: AuthUser,
  filters?: { from?: string; to?: string; category?: string },
) {
  const { start, end } = calendarDateRange(filters?.from, filters?.to, 30);
  const all = await prisma.pettyCashEntry.findMany({
    where: {
      deletedAt: null,
      entryDate: { lte: end },
      ...(user?.role === 'PRODUCTION_MANAGER' && user.plantId ? { plantId: user.plantId } : {}),
    },
    orderBy: [{ entryDate: 'asc' }, { voucherNo: 'asc' }, { createdAt: 'asc' }],
  });

  const withRun = withBalance(all);
  const inRange = withRun.filter((r) => r.entryDate >= start && r.entryDate <= end);
  const before = withRun.filter((r) => r.entryDate < start);
  const carryForward = before.length ? before[before.length - 1].balance : 0;
  const openingReceipts = inRange
    .filter((r) => r.category === 'Opening Balance')
    .reduce((s, r) => s + money(r.received), 0);
  const advances = inRange
    .filter((r) => r.category === 'Petty Cash Advance')
    .reduce((s, r) => s + money(r.received), 0);
  const otherReceived = inRange
    .filter((r) => r.category !== 'Opening Balance' && r.category !== 'Petty Cash Advance')
    .reduce((s, r) => s + money(r.received), 0);
  const openingBalance = money(carryForward);
  const cashReceived = money(openingReceipts + advances + otherReceived);
  const totalExpenses = inRange.reduce((s, r) => s + money(r.paid), 0);
  const closingCash = money(openingBalance + cashReceived - totalExpenses);

  const items = filters?.category ? inRange.filter((r) => r.category === filters.category) : inRange;

  return {
    summary: {
      openingBalance: money(openingBalance),
      advances: money(advances),
      cashReceived: money(cashReceived),
      totalExpenses: money(totalExpenses),
      closingCash,
    },
    categories: [...PETTY_CASH_CATEGORIES],
    items: items.map((e) => ({
      id: e.id,
      entryDate: toCalendarDate(e.entryDate),
      voucherNo: e.voucherNo,
      category: e.category,
      description: e.description,
      received: money(e.received),
      paid: money(e.paid),
      balance: money(e.balance),
      approvedBy: e.approvedBy,
      remarks: e.remarks,
      hasAttachment: Boolean(e.attachmentPath),
      attachmentName: e.attachmentName,
    })),
  };
}

export async function createPettyCash(data: EntryInput, user?: AuthUser) {
  const received = money(data.received);
  const paid = money(data.paid);
  if (received <= 0 && paid <= 0) throw new ValidationError('Enter received or paid amount');
  if (!PETTY_CASH_CATEGORIES.includes(data.category as PettyCashCategory)) {
    throw new ValidationError('Invalid expense category');
  }
  const isInflow = (INFLOW_CATEGORIES as readonly string[]).includes(data.category);
  if (isInflow && received <= 0) {
    throw new ValidationError('Enter the cash received for opening / advance');
  }
  if (isInflow && paid > 0) {
    throw new ValidationError('Opening and advance vouchers are cash-in only (Received)');
  }
  const voucherNo = data.voucherNo?.trim() || (await nextVoucherNo());
  const clash = await prisma.pettyCashEntry.findFirst({ where: { voucherNo, deletedAt: null } });
  if (clash) throw new ValidationError(`Voucher ${voucherNo} already exists`);

  return prisma.pettyCashEntry.create({
    data: {
      entryDate: new Date(`${data.entryDate.slice(0, 10)}T00:00:00.000Z`),
      voucherNo,
      category: data.category,
      description: data.description.trim(),
      received,
      paid,
      approvedBy: data.approvedBy?.trim() || user?.firstName || null,
      remarks: data.remarks?.trim() || null,
      attachmentName: data.attachment?.originalName || null,
      attachmentMime: data.attachment?.mime || null,
      attachmentPath: data.attachment?.storedName || null,
      plantId: data.plantId || user?.plantId || null,
      createdById: user?.id,
    },
  });
}

export async function updatePettyCash(id: string, data: Partial<EntryInput>) {
  const existing = await prisma.pettyCashEntry.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new ValidationError('Petty cash entry not found');
  const received = data.received == null ? existing.received : money(data.received);
  const paid = data.paid == null ? existing.paid : money(data.paid);
  if (received <= 0 && paid <= 0) throw new ValidationError('Enter received or paid amount');
  if (data.category && !PETTY_CASH_CATEGORIES.includes(data.category as PettyCashCategory)) {
    throw new ValidationError('Invalid expense category');
  }
  if (data.voucherNo?.trim() && data.voucherNo.trim() !== existing.voucherNo) {
    const clash = await prisma.pettyCashEntry.findFirst({
      where: { voucherNo: data.voucherNo.trim(), deletedAt: null, id: { not: id } },
    });
    if (clash) throw new ValidationError(`Voucher ${data.voucherNo.trim()} already exists`);
  }
  return prisma.pettyCashEntry.update({
    where: { id },
    data: {
      ...(data.entryDate ? { entryDate: new Date(`${data.entryDate.slice(0, 10)}T00:00:00.000Z`) } : {}),
      ...(data.voucherNo?.trim() ? { voucherNo: data.voucherNo.trim() } : {}),
      ...(data.category ? { category: data.category } : {}),
      ...(data.description != null ? { description: data.description.trim() } : {}),
      ...(data.received != null ? { received } : {}),
      ...(data.paid != null ? { paid } : {}),
      ...(data.approvedBy !== undefined ? { approvedBy: data.approvedBy?.trim() || null } : {}),
      ...(data.remarks !== undefined ? { remarks: data.remarks?.trim() || null } : {}),
    },
  });
}

export async function getPettyCashAttachment(id: string) {
  const existing = await prisma.pettyCashEntry.findFirst({ where: { id, deletedAt: null } });
  if (!existing?.attachmentPath || !existing.attachmentName) {
    throw new ValidationError('No voucher attachment on this entry');
  }
  return {
    storedName: existing.attachmentPath,
    name: existing.attachmentName,
    mime: existing.attachmentMime || 'application/octet-stream',
  };
}

export async function softDeletePettyCash(id: string) {
  const existing = await prisma.pettyCashEntry.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new ValidationError('Petty cash entry not found');
  return prisma.pettyCashEntry.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function exportPettyCashExcel(
  user?: AuthUser,
  filters?: { from?: string; to?: string; category?: string },
) {
  const ExcelJS = (await import('exceljs')).default;
  const { items, summary } = await listPettyCash(user, filters);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Nakshatra MES';
  const sheet = workbook.addWorksheet('Petty Cash');
  sheet.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Voucher No.', key: 'voucher', width: 14 },
    { header: 'Expense Category', key: 'category', width: 26 },
    { header: 'Description', key: 'description', width: 28 },
    { header: 'Received (₹)', key: 'received', width: 14 },
    { header: 'Paid (₹)', key: 'paid', width: 12 },
    { header: 'Balance (₹)', key: 'balance', width: 14 },
    { header: 'Approved By', key: 'approved', width: 16 },
    { header: 'Remarks', key: 'remarks', width: 24 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const e of items) {
    sheet.addRow({
      date: e.entryDate,
      voucher: e.voucherNo,
      category: e.category,
      description: e.description,
      received: e.received || '',
      paid: e.paid || '',
      balance: e.balance,
      approved: e.approvedBy || '',
      remarks: e.remarks || '',
    });
  }
  sheet.addRow({});
  sheet.addRow({ date: 'Opening Cash', received: summary.openingBalance });
  sheet.addRow({ date: 'Petty Cash Advance / Received', received: summary.cashReceived });
  sheet.addRow({ date: 'Total Expenses', paid: summary.totalExpenses });
  sheet.addRow({ date: 'Closing Cash', balance: summary.closingCash });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
