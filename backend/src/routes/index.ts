import { Router, type Request } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { success, parsePagination, buildMeta } from '../utils/api.js';
import * as authService from '../services/auth.service.js';
import * as userService from '../services/user.service.js';
import { masterService } from '../services/master.service.js';
import * as productionService from '../services/production.service.js';
import * as dashboardService from '../services/dashboard.service.js';
import * as reportService from '../services/report.service.js';
import * as wasteService from '../services/waste.service.js';
import * as salesService from '../services/sales.service.js';
import {
  loginSchema,
  changePasswordSchema,
  updateProfileSchema,
  userCreateSchema,
  userUpdateSchema,
  plantSchema,
  lineSchema,
  brandSchema,
  productSchema,
  skuSchema,
  machineSchema,
  downtimeCategorySchema,
  downtimeReasonSchema,
  changeoverTypeSchema,
  shiftSchema,
  productionPlanSchema,
  productionEntrySchema,
  downtimeEntrySchema,
  downtimeEntryUpdateSchema,
  changeoverEntrySchema,
  changeoverEntryUpdateSchema,
  manpowerEntrySchema,
  wasteEntrySchema,
  wasteEntryUpdateSchema,
  salesEntrySchema,
  shiftClosingSchema,
  approvalSchema,
  settingSchema,
} from '../validators/schemas.js';
import { prisma } from '../config/prisma.js';
import type { Role } from '@prisma/client';

const router = Router();

function idParam(req: Request, name = 'id') {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

/** Auth */
router.post(
  '/auth/login',
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const result = await authService.login(body.email, body.password, req);
    success(res, result);
  }),
);

router.get(
  '/auth/me',
  authenticate,
  asyncHandler(async (req, res) => {
    success(res, await authService.getProfile(req.user!.id));
  }),
);

router.patch(
  '/auth/profile',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = updateProfileSchema.parse(req.body);
    success(res, await authService.updateProfile(req.user!.id, body, req));
  }),
);

router.post(
  '/auth/change-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = changePasswordSchema.parse(req.body);
    success(res, await authService.changePassword(req.user!.id, body.currentPassword, body.newPassword, req));
  }),
);

/** Users */
router.get(
  '/supervisors',
  authenticate,
  authorize('ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'),
  asyncHandler(async (_req, res) => {
    success(res, await userService.listSupervisors());
  }),
);

router.get(
  '/users',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const { page, limit, skip, sortBy, sortOrder, search } = parsePagination(req);
    const result = await userService.listUsers({
      skip,
      take: limit,
      search,
      sortBy,
      sortOrder: sortOrder as 'asc' | 'desc',
      role: req.query.role as Role | undefined,
      plantId: req.query.plantId as string | undefined,
    });
    success(res, result.items, 200, buildMeta(result.total, page, limit));
  }),
);

router.post(
  '/users',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    success(res, await userService.createUser(userCreateSchema.parse(req.body), req), 201);
  }),
);

router.patch(
  '/users/:id',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    success(res, await userService.updateUser(idParam(req), userUpdateSchema.parse(req.body), req));
  }),
);

router.delete(
  '/users/:id',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    success(res, await userService.softDeleteUser(idParam(req), req));
  }),
);

/** Master data helpers */
function crudList(
  path: string,
  roles: Role[],
  listFn: (q: { skip: number; take: number; search?: string; [k: string]: unknown }) => Promise<{ total: number; items: unknown[] }>,
  extra?: (req: import('express').Request) => Record<string, unknown>,
) {
  router.get(
    path,
    authenticate,
    authorize(...roles),
    asyncHandler(async (req, res) => {
      const { page, limit, skip, search } = parsePagination(req);
      const result = await listFn({ skip, take: limit, search, ...(extra?.(req) ?? {}) });
      success(res, result.items, 200, buildMeta(result.total, page, limit));
    }),
  );
}

crudList('/plants', ['ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'], (q) => masterService.listPlants(q));
router.post('/plants', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  success(res, await masterService.createPlant(plantSchema.parse(req.body), req), 201);
}));
router.patch('/plants/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  success(res, await masterService.updatePlant(idParam(req), plantSchema.partial().parse(req.body), req));
}));
router.delete('/plants/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  success(res, await masterService.deletePlant(idParam(req), req));
}));

crudList('/lines', ['ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'], (q) => masterService.listLines(q as never), (req) => ({
  plantId: req.query.plantId,
}));
router.post('/lines', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER'), asyncHandler(async (req, res) => {
  success(res, await masterService.createLine(lineSchema.parse(req.body), req), 201);
}));
router.patch('/lines/:id', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER'), asyncHandler(async (req, res) => {
  success(res, await masterService.updateLine(idParam(req), lineSchema.partial().parse(req.body), req));
}));
router.delete('/lines/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  success(res, await masterService.deleteLine(idParam(req), req));
}));

crudList('/products', ['ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'], (q) => masterService.listProducts(q));
router.post('/products', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER'), asyncHandler(async (req, res) => {
  success(res, await masterService.createProduct(productSchema.parse(req.body), req), 201);
}));
router.patch('/products/:id', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER'), asyncHandler(async (req, res) => {
  success(res, await masterService.updateProduct(idParam(req), productSchema.partial().parse(req.body), req));
}));
router.delete('/products/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  success(res, await masterService.deleteProduct(idParam(req), req));
}));

crudList('/brands', ['ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'], (q) => masterService.listBrands(q));
router.post('/brands', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER'), asyncHandler(async (req, res) => {
  success(res, await masterService.createBrand(brandSchema.parse(req.body), req), 201);
}));
router.patch('/brands/:id', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER'), asyncHandler(async (req, res) => {
  success(res, await masterService.updateBrand(idParam(req), brandSchema.partial().parse(req.body), req));
}));
router.delete('/brands/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  success(res, await masterService.deleteBrand(idParam(req), req));
}));

crudList('/skus', ['ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'], (q) => masterService.listSkus(q as never), (req) => ({
  productId: req.query.productId,
}));
router.post('/skus', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER'), asyncHandler(async (req, res) => {
  success(res, await masterService.createSku(skuSchema.parse(req.body), req), 201);
}));
router.patch('/skus/:id', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER'), asyncHandler(async (req, res) => {
  success(res, await masterService.updateSku(idParam(req), skuSchema.partial().parse(req.body), req));
}));
router.delete('/skus/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  success(res, await masterService.deleteSku(idParam(req), req));
}));

crudList('/machines', ['ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'], (q) => masterService.listMachines(q as never), (req) => ({
  lineId: req.query.lineId,
}));
router.post('/machines', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER'), asyncHandler(async (req, res) => {
  success(res, await masterService.createMachine(machineSchema.parse(req.body), req), 201);
}));
router.patch('/machines/:id', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER'), asyncHandler(async (req, res) => {
  success(res, await masterService.updateMachine(idParam(req), machineSchema.partial().parse(req.body), req));
}));
router.delete('/machines/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  success(res, await masterService.deleteMachine(idParam(req), req));
}));

router.get('/downtime-categories', authenticate, asyncHandler(async (_req, res) => {
  success(res, await masterService.listDowntimeCategories());
}));
router.post('/downtime-categories', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  success(res, await masterService.createDowntimeCategory(downtimeCategorySchema.parse(req.body), req), 201);
}));
router.patch('/downtime-categories/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  success(res, await masterService.updateDowntimeCategory(idParam(req), downtimeCategorySchema.partial().parse(req.body), req));
}));
router.delete('/downtime-categories/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  success(res, await masterService.deleteDowntimeCategory(idParam(req), req));
}));

router.post('/downtime-reasons', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  success(res, await masterService.createDowntimeReason(downtimeReasonSchema.parse(req.body), req), 201);
}));
router.patch('/downtime-reasons/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  success(res, await masterService.updateDowntimeReason(idParam(req), downtimeReasonSchema.partial().parse(req.body), req));
}));
router.delete('/downtime-reasons/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  success(res, await masterService.deleteDowntimeReason(idParam(req), req));
}));

router.get('/changeover-types', authenticate, asyncHandler(async (_req, res) => {
  success(res, await masterService.listChangeoverTypes());
}));
router.post('/changeover-types', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  success(res, await masterService.createChangeoverType(changeoverTypeSchema.parse(req.body), req), 201);
}));
router.patch('/changeover-types/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  success(res, await masterService.updateChangeoverType(idParam(req), changeoverTypeSchema.partial().parse(req.body), req));
}));
router.delete('/changeover-types/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  success(res, await masterService.deleteChangeoverType(idParam(req), req));
}));

router.get('/shifts', authenticate, asyncHandler(async (_req, res) => {
  success(res, await masterService.listShifts());
}));
router.post('/shifts', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  success(res, await masterService.createShift(shiftSchema.parse(req.body), req), 201);
}));
router.patch('/shifts/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  success(res, await masterService.updateShift(idParam(req), shiftSchema.partial().parse(req.body), req));
}));
router.delete('/shifts/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  success(res, await masterService.deleteShift(idParam(req), req));
}));

/** Production plans & shop-floor */
router.get('/plans', authenticate, asyncHandler(async (req, res) => {
  const { page, limit, skip, search } = parsePagination(req);
  const result = await productionService.listPlans(
    {
      skip,
      take: limit,
      search,
      plantId: req.query.plantId as string | undefined,
      lineId: req.query.lineId as string | undefined,
      shiftId: req.query.shiftId as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      status: req.query.status as string | undefined,
    },
    req.user,
  );
  success(res, result.items, 200, buildMeta(result.total, page, limit));
}));

router.get('/plans/export/excel', authenticate, asyncHandler(async (req, res) => {
  const buffer = await productionService.exportPlansExcel(
    {
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      plantId: req.query.plantId as string | undefined,
      lineId: req.query.lineId as string | undefined,
      shiftId: req.query.shiftId as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      status: req.query.status as string | undefined,
    },
    req.user,
  );
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=production-plans.xlsx');
  res.send(buffer);
}));

router.get('/production-entries/export/excel', authenticate, asyncHandler(async (req, res) => {
  const mode = String(req.query.mode || 'day') === 'shift' ? 'shift' : 'day';
  const date = typeof req.query.date === 'string' ? req.query.date : undefined;
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  const shiftId = typeof req.query.shiftId === 'string' ? req.query.shiftId : undefined;
  const lineId = typeof req.query.lineId === 'string' ? req.query.lineId : undefined;
  const { buffer, filename } = await productionService.exportProductionEntriesReportExcel(
    { mode, date, from, to, shiftId, lineId },
    req.user,
  );
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.send(buffer);
}));

router.get('/plans/:id/entries/export/excel', authenticate, asyncHandler(async (req, res) => {
  const id = idParam(req);
  const { buffer, planNumber } = await productionService.exportPlanEntriesExcel(id, req.user);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=production-entries-${planNumber}.xlsx`);
  res.send(buffer);
}));

router.get('/plans/:id', authenticate, asyncHandler(async (req, res) => {
  success(res, await productionService.getPlan(idParam(req), req.user));
}));

router.post('/plans', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER'), asyncHandler(async (req, res) => {
  success(res, await productionService.createPlan(productionPlanSchema.parse(req.body), req), 201);
}));

router.patch('/plans/:id', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER'), asyncHandler(async (req, res) => {
  success(res, await productionService.updatePlan(idParam(req), productionPlanSchema.partial().parse(req.body), req));
}));

router.delete('/plans/:id', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER'), asyncHandler(async (req, res) => {
  success(res, await productionService.deletePlan(idParam(req), req));
}));

router.post('/production-entries', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'), asyncHandler(async (req, res) => {
  success(res, await productionService.createProductionEntry(productionEntrySchema.parse(req.body), req), 201);
}));

router.patch('/production-entries/:id', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'), asyncHandler(async (req, res) => {
  success(res, await productionService.updateProductionEntry(idParam(req), productionEntrySchema.partial().parse(req.body), req));
}));

router.delete('/production-entries/:id', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'), asyncHandler(async (req, res) => {
  success(res, await productionService.deleteProductionEntry(idParam(req), req));
}));

router.post('/production-entries/:id/approve', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER'), asyncHandler(async (req, res) => {
  const body = approvalSchema.parse(req.body);
  success(res, await productionService.approveEntry(idParam(req), body.status, body.approvalRemarks, req));
}));

router.post('/downtime-entries', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'), asyncHandler(async (req, res) => {
  success(res, await productionService.createDowntime(downtimeEntrySchema.parse(req.body), req), 201);
}));

router.patch('/downtime-entries/:id', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'), asyncHandler(async (req, res) => {
  success(res, await productionService.updateDowntime(idParam(req), downtimeEntryUpdateSchema.parse(req.body), req));
}));

router.delete('/downtime-entries/:id', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'), asyncHandler(async (req, res) => {
  success(res, await productionService.deleteDowntime(idParam(req), req));
}));

router.get('/changeover-entries', authenticate, asyncHandler(async (req, res) => {
  success(res, await productionService.listChangeovers(req.user));
}));

router.get('/changeover-entries/export/excel', authenticate, asyncHandler(async (req, res) => {
  const buffer = await productionService.exportChangeoversExcel(req.user);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=changeover-details.xlsx');
  res.send(buffer);
}));

router.post('/changeover-entries', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'), asyncHandler(async (req, res) => {
  success(res, await productionService.createChangeover(changeoverEntrySchema.parse(req.body), req), 201);
}));

router.patch('/changeover-entries/:id', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'), asyncHandler(async (req, res) => {
  success(res, await productionService.updateChangeover(idParam(req), changeoverEntryUpdateSchema.parse(req.body), req));
}));

router.delete('/changeover-entries/:id', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'), asyncHandler(async (req, res) => {
  success(res, await productionService.deleteChangeover(idParam(req), req));
}));

router.post('/manpower-entries', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'), asyncHandler(async (req, res) => {
  success(res, await productionService.createManpower(manpowerEntrySchema.parse(req.body), req), 201);
}));

/** Waste — raw material scrap / waste */
router.get('/waste-materials', authenticate, asyncHandler(async (_req, res) => {
  success(res, await wasteService.listWasteMaterials());
}));

router.get('/waste-entries', authenticate, asyncHandler(async (req, res) => {
  success(
    res,
    await wasteService.listWasteEntries({
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      materialId: req.query.materialId as string | undefined,
      shiftId: req.query.shiftId as string | undefined,
      lineId: req.query.lineId as string | undefined,
      planId: req.query.planId as string | undefined,
    }),
  );
}));

router.get('/waste-entries/export/excel', authenticate, asyncHandler(async (req, res) => {
  const planId = String(req.query.planId || '');
  const { buffer, planNumber, date } = await wasteService.exportWasteEntriesExcel(planId);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=waste-entries-${planNumber || 'wo'}-${date || 'export'}.xlsx`,
  );
  res.send(buffer);
}));

router.get('/waste-entries/work-order-status', authenticate, asyncHandler(async (req, res) => {
  success(
    res,
    await wasteService.listWastageWorkOrderStatus({
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      shiftId: req.query.shiftId as string | undefined,
      lineId: req.query.lineId as string | undefined,
      status: req.query.status as 'PENDING' | 'PARTIAL' | 'COMPLETED' | 'ALL' | undefined,
    }),
  );
}));

router.post('/waste-entries', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'), asyncHandler(async (req, res) => {
  success(res, await wasteService.createWasteEntry(wasteEntrySchema.parse(req.body), req), 201);
}));

router.patch('/waste-entries/:id', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'), asyncHandler(async (req, res) => {
  success(res, await wasteService.updateWasteEntry(idParam(req), wasteEntryUpdateSchema.parse(req.body)));
}));

router.delete('/waste-entries/:id', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'), asyncHandler(async (req, res) => {
  success(res, await wasteService.deleteWasteEntry(idParam(req)));
}));

router.get('/dashboard/waste-report', authenticate, asyncHandler(async (req, res) => {
  success(
    res,
    await wasteService.getWasteReport({
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      materialId: req.query.materialId as string | undefined,
      shiftId: req.query.shiftId as string | undefined,
      lineId: req.query.lineId as string | undefined,
    }),
  );
}));

router.post('/shift-closings', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'), asyncHandler(async (req, res) => {
  const body = shiftClosingSchema.parse(req.body);
  success(res, await productionService.closeShift(body.planId, body.remarks, req), 201);
}));

/** Dashboard */
router.get('/dashboard/kpis', authenticate, asyncHandler(async (req, res) => {
  success(
    res,
    await dashboardService.getDashboardKpis(
      req.user,
      req.query.from as string,
      req.query.to as string,
      req.query.shiftId as string | undefined,
    ),
  );
}));

router.get('/dashboard/charts', authenticate, asyncHandler(async (req, res) => {
  success(
    res,
    await dashboardService.getDashboardCharts(
      req.user,
      req.query.from as string,
      req.query.to as string,
      req.query.shiftId as string | undefined,
    ),
  );
}));

router.get('/dashboard/summary', authenticate, asyncHandler(async (req, res) => {
  success(
    res,
    await dashboardService.getDashboardSummary(
      req.user,
      req.query.from as string,
      req.query.to as string,
      req.query.shiftId as string | undefined,
    ),
  );
}));

router.get('/dashboard/plan-vs-actual', authenticate, asyncHandler(async (req, res) => {
  success(
    res,
    await dashboardService.getPlanVsActualDashboard(req.user, {
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      brandId: req.query.brandId as string | undefined,
      skuId: req.query.skuId as string | undefined,
      packVolume: req.query.packVolume as string | undefined,
    }),
  );
}));

router.get('/dashboard/plan-vs-actual/export/excel', authenticate, asyncHandler(async (req, res) => {
  const buffer = await dashboardService.exportPlanVsActualExcel(req.user, {
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
    brandId: req.query.brandId as string | undefined,
    skuId: req.query.skuId as string | undefined,
    packVolume: req.query.packVolume as string | undefined,
  });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=plan-vs-actual-${(req.query.from as string) || 'from'}-${(req.query.to as string) || 'to'}.xlsx`,
  );
  res.send(buffer);
}));

router.get('/dashboard/changeover-analysis', authenticate, asyncHandler(async (req, res) => {
  success(
    res,
    await dashboardService.getChangeoverAnalysis(req.user, {
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      lineId: req.query.lineId as string | undefined,
    }),
  );
}));

router.get('/dashboard/downtime-analysis', authenticate, asyncHandler(async (req, res) => {
  success(
    res,
    await dashboardService.getDowntimeAnalysis(req.user, {
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      lineId: req.query.lineId as string | undefined,
    }),
  );
}));

router.get('/dashboard/manpower-analysis', authenticate, asyncHandler(async (req, res) => {
  success(
    res,
    await dashboardService.getManpowerAnalysis(req.user, {
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      lineId: req.query.lineId as string | undefined,
      shiftId: req.query.shiftId as string | undefined,
    }),
  );
}));

router.get('/dashboard/pending-approvals', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER'), asyncHandler(async (req, res) => {
  success(res, await dashboardService.getPendingApprovals(req.user));
}));

router.get('/dashboard/line-wise', authenticate, asyncHandler(async (req, res) => {
  const { getLineWiseOverview } = await import('../services/lineOverview.service.js');
  success(
    res,
    await getLineWiseOverview(
      {
        date: req.query.date as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        plantId: req.query.plantId as string | undefined,
      },
      req.user,
    ),
  );
}));

router.get('/dashboard/day-wise', authenticate, asyncHandler(async (req, res) => {
  const { getDayWiseOee } = await import('../services/lineOverview.service.js');
  success(
    res,
    await getDayWiseOee(
      {
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        plantId: req.query.plantId as string | undefined,
        lineId: req.query.lineId as string | undefined,
      },
      req.user,
    ),
  );
}));

router.get('/dashboard/day-wise/export/excel', authenticate, asyncHandler(async (req, res) => {
  const { exportDayWiseOeeExcel } = await import('../services/lineOverview.service.js');
  const buffer = await exportDayWiseOeeExcel(
    {
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      plantId: req.query.plantId as string | undefined,
      lineId: req.query.lineId as string | undefined,
    },
    req.user,
  );
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=day-wise-oee-${(req.query.from as string) || 'from'}-${(req.query.to as string) || 'to'}.xlsx`,
  );
  res.send(buffer);
}));

router.get('/dashboard/week-wise', authenticate, asyncHandler(async (req, res) => {
  const { getWeekWiseOee } = await import('../services/lineOverview.service.js');
  success(
    res,
    await getWeekWiseOee(
      {
        month: req.query.month as string | undefined,
        plantId: req.query.plantId as string | undefined,
        lineId: req.query.lineId as string | undefined,
      },
      req.user,
    ),
  );
}));

router.get('/dashboard/sales', authenticate, asyncHandler(async (req, res) => {
  success(
    res,
    await salesService.getSalesDashboard(req.user, {
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      plantId: req.query.plantId as string | undefined,
      channel: req.query.channel as string | undefined,
    }),
  );
}));

router.get('/dashboard/sales/export/excel', authenticate, asyncHandler(async (req, res) => {
  const buffer = await salesService.exportSalesExcel(req.user, {
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
    plantId: req.query.plantId as string | undefined,
    channel: req.query.channel as string | undefined,
  });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=sales-${(req.query.from as string) || 'from'}-${(req.query.to as string) || 'to'}.xlsx`,
  );
  res.send(buffer);
}));

router.get('/sales-entries', authenticate, asyncHandler(async (req, res) => {
  success(
    res,
    await salesService.listSalesEntries(req.user, {
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      plantId: req.query.plantId as string | undefined,
    }),
  );
}));

router.post('/sales-entries', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER'), asyncHandler(async (req, res) => {
  const body = salesEntrySchema.parse(req.body);
  success(res, await salesService.createSalesEntry(body, req.user), 201);
}));

router.delete('/sales-entries/:id', authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER'), asyncHandler(async (req, res) => {
  success(res, await salesService.softDeleteSalesEntry(idParam(req, 'id')));
}));

/** Reports */
router.get('/reports/:type', authenticate, asyncHandler(async (req, res) => {
  const rows = await reportService.buildReportRows(
    idParam(req, 'type'),
    {
      from: req.query.from as string,
      to: req.query.to as string,
      plantId: req.query.plantId as string,
      lineId: req.query.lineId as string,
      shiftId: req.query.shiftId as string,
    },
    req.user,
  );
  success(res, rows);
}));

router.get('/reports/:type/export/excel', authenticate, asyncHandler(async (req, res) => {
  const buffer = await reportService.exportExcel(
    idParam(req, 'type'),
    {
      from: req.query.from as string,
      to: req.query.to as string,
      plantId: req.query.plantId as string,
      lineId: req.query.lineId as string,
      shiftId: req.query.shiftId as string,
    },
    req.user,
  );
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${idParam(req, 'type')}-report.xlsx`);
  res.send(buffer);
}));

router.get('/reports/:type/export/pdf', authenticate, asyncHandler(async (req, res) => {
  const buffer = await reportService.exportPdf(
    idParam(req, 'type'),
    {
      from: req.query.from as string,
      to: req.query.to as string,
      plantId: req.query.plantId as string,
      lineId: req.query.lineId as string,
      shiftId: req.query.shiftId as string,
    },
    req.user,
  );
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${idParam(req, 'type')}-report.pdf`);
  res.send(buffer);
}));

/** Notifications */
router.get('/notifications', authenticate, asyncHandler(async (req, res) => {
  const items = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  success(res, items);
}));

router.get('/notifications/unread-count', authenticate, asyncHandler(async (req, res) => {
  const unread = await prisma.notification.count({
    where: { userId: req.user!.id, isRead: false },
  });
  success(res, { unread });
}));

router.patch('/notifications/:id/read', authenticate, asyncHandler(async (req, res) => {
  const item = await prisma.notification.updateMany({
    where: { id: idParam(req), userId: req.user!.id },
    data: { isRead: true, readAt: new Date() },
  });
  success(res, item);
}));

router.post('/notifications/read-all', authenticate, asyncHandler(async (req, res) => {
  const item = await prisma.notification.updateMany({
    where: { userId: req.user!.id, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  success(res, item);
}));

/** Audit logs & settings */
router.get('/audit-logs', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  const { page, limit, skip, search } = parsePagination(req);
  const where = {
    ...(search
      ? {
          OR: [
            { action: { contains: search, mode: 'insensitive' as const } },
            { entity: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
    }),
  ]);
  success(res, items, 200, buildMeta(total, page, limit));
}));

router.get('/settings', authenticate, authorize('ADMIN'), asyncHandler(async (_req, res) => {
  success(res, await prisma.appSetting.findMany({ orderBy: { key: 'asc' } }));
}));

router.put('/settings', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  const body = settingSchema.parse(req.body);
  const item = await prisma.appSetting.upsert({
    where: { key: body.key },
    create: { key: body.key, value: body.value, description: body.description, updatedById: req.user!.id },
    update: { value: body.value, description: body.description, updatedById: req.user!.id },
  });
  success(res, item);
}));

/** Global search */
router.get('/search', authenticate, asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) return success(res, { plants: [], lines: [], products: [], plans: [], users: [] });

  const [plants, lines, products, plans, users] = await Promise.all([
    prisma.plant.findMany({
      where: { deletedAt: null, OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }] },
      take: 5,
    }),
    prisma.productionLine.findMany({
      where: { deletedAt: null, OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }] },
      take: 5,
    }),
    prisma.product.findMany({
      where: { deletedAt: null, OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }] },
      take: 5,
    }),
    prisma.productionPlan.findMany({
      where: { deletedAt: null, OR: [{ planNumber: { contains: q, mode: 'insensitive' } }, { batchNumber: { contains: q, mode: 'insensitive' } }] },
      take: 5,
    }),
    req.user?.role === 'ADMIN'
      ? prisma.user.findMany({
          where: {
            deletedAt: null,
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { employeeId: { contains: q, mode: 'insensitive' } },
            ],
          },
          take: 5,
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        })
      : Promise.resolve([]),
  ]);

  success(res, { plants, lines, products, plans, users });
}));

export default router;

