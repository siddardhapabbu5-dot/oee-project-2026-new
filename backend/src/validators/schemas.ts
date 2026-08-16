import { z } from 'zod';
import { Role, PlanStatus, EntryStatus, ChangeoverKind, ChangeoverStatus } from '@prisma/client';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(8),
});

export const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
});

export const userCreateSchema = z.object({
  employeeId: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  role: z.nativeEnum(Role),
  plantId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const userUpdateSchema = userCreateSchema.partial().omit({ password: true }).extend({
  password: z.string().min(8).optional(),
});

export const plantSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  location: z.string().optional().nullable(),
  timezone: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const lineSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  plantId: z.string().min(1),
  supervisorId: z.string().optional().nullable(),
  capacityCph: z.number().positive().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const brandSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const productSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  brandId: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  uom: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const skuSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  productId: z.string().min(1),
  packSize: z.coerce.number().int().positive().optional().nullable(),
  packVolume: z.string().optional().nullable(),
  bottlesPerHour: z.coerce.number().int().positive().optional().nullable(),
  casesPerPallet: z.number().int().positive().optional().nullable(),
  netWeightKg: z.number().positive().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const machineSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  lineId: z.string().min(1),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const downtimeCategorySchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const downtimeReasonSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  categoryId: z.string().min(1),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const changeoverTypeSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  standardMins: z.number().positive(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const shiftSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  isActive: z.boolean().optional(),
});

export const productionPlanSchema = z.object({
  productionDate: z.string().or(z.date()),
  plantId: z.string(),
  lineId: z.string(),
  shiftId: z.string(),
  productId: z.string(),
  skuId: z.string(),
  batchNumber: z.string().min(1),
  plannedCases: z.number().positive(),
  plannedOperatingMins: z.number().positive(),
  plannedStartTime: z.string().or(z.date()),
  plannedEndTime: z.string().or(z.date()),
  plannedManpower: z.number().int().positive(),
  supervisorId: z.string().optional().nullable(),
  status: z.nativeEnum(PlanStatus).optional(),
  remarks: z.string().optional().nullable(),
  allowOverlap: z.boolean().optional(),
});

export const productionEntrySchema = z.object({
  planId: z.string(),
  hourStart: z.string().or(z.date()),
  hourEnd: z.string().or(z.date()),
  plannedCases: z.number().nonnegative(),
  actualCases: z.number().nonnegative(),
  goodCases: z.number().nonnegative(),
  rejectCases: z.number().nonnegative(),
  remarks: z.string().optional().nullable(),
  status: z.nativeEnum(EntryStatus).optional(),
  reworkByZone: z
    .array(
      z.object({
        zone: z.enum(['BLOW_MOULD', 'FILLER', 'CAPPER', 'LABEL', 'PACKAGING', 'OTHER']),
        reworkCases: z.number().nonnegative(),
      }),
    )
    .optional(),
});

export const downtimeEntryBaseSchema = z.object({
  planId: z.string().min(1),
  machineId: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v && String(v).trim() ? String(v).trim() : null)),
  categoryId: z.string().optional().nullable(),
  reasonId: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  startTime: z.string().or(z.date()),
  endTime: z.string().or(z.date()),
  actionTaken: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
});

export const downtimeEntrySchema = downtimeEntryBaseSchema.superRefine((val, ctx) => {
  const hasReasonId = !!(val.reasonId && String(val.reasonId).trim());
  const hasReasonText = !!(val.reason && String(val.reason).trim());
  if (!hasReasonId && !hasReasonText) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Reason is required', path: ['reason'] });
  }
});

export const downtimeEntryUpdateSchema = downtimeEntryBaseSchema.partial().omit({ planId: true });

export const changeoverEntrySchema = z.object({
  planId: z.string().optional().nullable(),
  lineId: z.string().optional().nullable(),
  productionDate: z.string().or(z.date()).optional().nullable(),
  changeoverTypeId: z.string().min(1, 'Changeover type is required'),
  fromProductId: z.string().min(1, 'From product is required'),
  toProductId: z.string().min(1, 'To product is required'),
  fromSkuId: z.string().optional().nullable(),
  toSkuId: z.string().optional().nullable(),
  kind: z.nativeEnum(ChangeoverKind).optional(),
  status: z.nativeEnum(ChangeoverStatus).optional(),
  standardMins: z.number().nonnegative(),
  actualMins: z.number().nonnegative().optional(),
  reason: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  startTime: z.string().or(z.date()).optional().nullable(),
  endTime: z.string().or(z.date()).optional().nullable(),
});

export const changeoverEntryUpdateSchema = changeoverEntrySchema.partial();

export const manpowerEntrySchema = z.object({
  planId: z.string(),
  headcount: z.number().int().positive(),
  operators: z.number().int().nonnegative().optional().nullable(),
  helpers: z.number().int().nonnegative().optional().nullable(),
  overtimeMins: z.number().nonnegative().optional().nullable(),
  remarks: z.string().optional().nullable(),
  recordedAt: z.string().or(z.date()).optional(),
});

export const wasteEntrySchema = z.object({
  wasteDate: z.string().min(8),
  materialId: z.string().min(1),
  quantity: z.number().nonnegative(), // wastage qty
  actualQtyIssued: z.number().nonnegative().optional().nullable(),
  unit: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  shiftId: z.string().optional().nullable(),
  lineId: z.string().optional().nullable(),
  planId: z.string().min(1),
});

export const wasteEntryUpdateSchema = wasteEntrySchema.partial();

export const salesEntrySchema = z.object({
  saleDate: z.string().min(8),
  plantId: z.string().optional().nullable(),
  brandId: z.string().optional().nullable(),
  productId: z.string().min(1),
  skuId: z.string().min(1),
  channel: z.enum(['DISTRIBUTOR', 'RETAIL', 'MODERN_TRADE', 'EXPORT', 'OTHER']).optional(),
  customerName: z.string().optional().nullable(),
  invoiceNo: z.string().optional().nullable(),
  casesSold: z.number().positive(),
  unitPrice: z.number().nonnegative().optional(),
  remarks: z.string().optional().nullable(),
});

export const rftEntrySchema = z.object({
  entryDate: z.string().min(8),
  lineId: z.string().min(1),
  shiftId: z.string().min(1),
  productId: z.string().min(1),
  skuId: z.string().min(1),
  totalProduced: z.number().nonnegative(),
  remarks: z.string().optional().nullable(),
  rejects: z
    .array(
      z.object({
        areaId: z.string().min(1),
        rejectTypeId: z.string().optional().nullable(),
        quantity: z.number().nonnegative(),
      }),
    )
    .optional(),
});

export const shiftClosingSchema = z.object({
  planId: z.string(),
  remarks: z.string().optional().nullable(),
});

export const approvalSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  approvalRemarks: z.string().optional().nullable(),
});

export const settingSchema = z.object({
  key: z.string().min(1),
  value: z.any(),
  description: z.string().optional().nullable(),
});
