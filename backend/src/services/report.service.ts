import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { prisma } from '../config/prisma.js';
import type { AuthUser } from '../middleware/auth.js';
import {
  calcAchievement,
  computeOeeMetrics,
  splitDowntimeMins,
} from '../utils/oee.js';
import { calendarDateRange, toCalendarDate } from '../utils/dates.js';

function planScope(user?: AuthUser) {
  if (!user) return {};
  if (user.role === 'LINE_SUPERVISOR') {
    return { OR: [{ supervisorId: user.id }, { line: { supervisorId: user.id } }] };
  }
  if (user.role === 'PRODUCTION_MANAGER' && user.plantId) {
    return { plantId: user.plantId };
  }
  return {};
}

export async function buildReportRows(
  type: string,
  filters: { from?: string; to?: string; plantId?: string; lineId?: string; shiftId?: string },
  user?: AuthUser,
) {
  const { start, end } = calendarDateRange(filters.from, filters.to, 7);

  const plans = await prisma.productionPlan.findMany({
    where: {
      deletedAt: null,
      productionDate: { gte: start, lte: end },
      ...(filters.plantId ? { plantId: filters.plantId } : {}),
      ...(filters.lineId ? { lineId: filters.lineId } : {}),
      ...(filters.shiftId ? { shiftId: filters.shiftId } : {}),
      ...planScope(user),
    },
    include: {
      plant: true,
      line: true,
      shift: true,
      product: true,
      sku: true,
      supervisor: true,
      productionEntries: { where: { deletedAt: null } },
      downtimeEntries: {
        where: { deletedAt: null },
        include: { category: true, reason: true, machine: true },
      },
      changeoverEntries: {
        where: { deletedAt: null },
        include: { fromProduct: true, toProduct: true, changeoverType: true },
      },
    },
    orderBy: { productionDate: 'asc' },
  });

  switch (type) {
    case 'daily':
    case 'shift':
    case 'line':
    case 'supervisor':
    case 'oee':
      return plans.map((p) => {
        const actual = p.productionEntries.reduce((s, e) => s + e.actualCases, 0);
        const good = p.productionEntries.reduce((s, e) => s + e.goodCases, 0);
        const reject = p.productionEntries.reduce((s, e) => s + e.rejectCases, 0);
        const split = splitDowntimeMins(p.downtimeEntries);
        const metrics = computeOeeMetrics({
          plannedProductionTimeMins: p.plannedOperatingMins,
          downtimeMins: split.totalDowntimeMins,
          plannedLossMins: split.plannedLossMins,
          unplannedDowntimeMins: split.unplannedDowntimeMins,
          plannedCount: p.plannedCases,
          totalCount: actual || good + reject,
          goodCount: good,
          capacityCph: p.line.capacityCph,
        });
        return {
          date: toCalendarDate(p.productionDate),
          planNumber: p.planNumber,
          plant: p.plant.name,
          line: p.line.name,
          shift: p.shift.name,
          product: p.product.name,
          sku: p.sku.code,
          batch: p.batchNumber,
          supervisor: p.supervisor ? `${p.supervisor.firstName} ${p.supervisor.lastName}` : '',
          planned: p.plannedCases,
          actual,
          achievement: calcAchievement(p.plannedCases, actual),
          good,
          reject,
          downtime: split.unplannedDowntimeMins,
          plannedLoss: split.plannedLossMins,
          plannedTime: metrics.plannedProductionTimeMins,
          runTime: metrics.runTimeMins,
          availability: metrics.availability,
          performance: metrics.performance,
          quality: metrics.quality,
          oee: metrics.oee,
        };
      });
    case 'downtime':
      return plans.flatMap((p) =>
        p.downtimeEntries.map((d) => ({
          date: toCalendarDate(p.productionDate),
          planNumber: p.planNumber,
          line: p.line.name,
          machine: d.machine?.name ?? '',
          category: d.category.name,
          reason: d.reason.name,
          start: d.startTime.toISOString(),
          end: d.endTime.toISOString(),
          durationMins: d.durationMins,
          actionTaken: d.actionTaken ?? '',
        })),
      );
    case 'changeover':
      return plans.flatMap((p) =>
        p.changeoverEntries.map((c) => ({
          date: toCalendarDate(p.productionDate),
          planNumber: p.planNumber,
          line: p.line.name,
          type: c.changeoverType.name,
          fromProduct: c.fromProduct.name,
          toProduct: c.toProduct.name,
          kind: c.kind,
          status: c.status,
          standardMins: c.standardMins,
          actualMins: c.actualMins,
          reason: c.reason ?? '',
        })),
      );
    case 'machine': {
      const map = new Map<string, { machine: string; downtime: number; events: number; line: string }>();
      for (const p of plans) {
        for (const d of p.downtimeEntries) {
          if (!d.machine) continue;
          const cur = map.get(d.machine.id) ?? {
            machine: d.machine.name,
            downtime: 0,
            events: 0,
            line: p.line.name,
          };
          cur.downtime += d.durationMins;
          cur.events += 1;
          map.set(d.machine.id, cur);
        }
      }
      return [...map.values()];
    }
    default:
      return [];
  }
}

export async function exportExcel(
  type: string,
  filters: { from?: string; to?: string; plantId?: string; lineId?: string; shiftId?: string },
  user?: AuthUser,
) {
  const rows = await buildReportRows(type, filters, user);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Production Management System';
  const sheet = workbook.addWorksheet(`${type}-report`);

  if (!rows.length) {
    sheet.addRow(['No data']);
  } else {
    const keys = Object.keys(rows[0] as object);
    sheet.addRow(keys);
    sheet.getRow(1).font = { bold: true };
    for (const row of rows) {
      sheet.addRow(keys.map((k) => (row as Record<string, unknown>)[k]));
    }
    sheet.columns.forEach((col) => {
      col.width = 18;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function exportPdf(
  type: string,
  filters: { from?: string; to?: string; plantId?: string; lineId?: string; shiftId?: string },
  user?: AuthUser,
): Promise<Buffer> {
  const rows = await buildReportRows(type, filters, user);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text(`Production Management — ${type.toUpperCase()} Report`, { underline: true });
    doc.moveDown();
    doc.fontSize(10).text(`Generated: ${new Date().toISOString()}`);
    doc.moveDown();

    if (!rows.length) {
      doc.text('No data for selected filters.');
    } else {
      const keys = Object.keys(rows[0] as object).slice(0, 8);
      doc.font('Helvetica-Bold').text(keys.join(' | '));
      doc.font('Helvetica');
      for (const row of rows.slice(0, 40)) {
        doc.text(keys.map((k) => String((row as Record<string, unknown>)[k] ?? '')).join(' | '));
      }
      if (rows.length > 40) doc.text(`... and ${rows.length - 40} more rows`);
    }

    doc.end();
  });
}
