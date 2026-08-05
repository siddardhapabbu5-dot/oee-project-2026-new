-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ChangeoverKind" AS ENUM ('PLANNED', 'UNPLANNED');

-- CreateEnum
CREATE TYPE "ChangeoverStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TARGET_MISSED', 'HIGH_DOWNTIME', 'MACHINE_BREAKDOWN', 'PENDING_APPROVAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ShiftClosingStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL DEFAULT 'LINE_SUPERVISOR',
    "plantId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plants" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "plants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_lines" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "supervisorId" TEXT,
    "capacityCph" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "production_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "uom" TEXT NOT NULL DEFAULT 'CASE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skus" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "casesPerPallet" INTEGER,
    "netWeightKg" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "skus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machines" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "downtime_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "downtime_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "downtime_reasons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "downtime_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "changeover_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "standardMins" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "changeover_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_plans" (
    "id" TEXT NOT NULL,
    "planNumber" TEXT NOT NULL,
    "productionDate" DATE NOT NULL,
    "plantId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "plannedCases" DOUBLE PRECISION NOT NULL,
    "plannedOperatingMins" DOUBLE PRECISION NOT NULL,
    "plannedStartTime" TIMESTAMP(3) NOT NULL,
    "plannedEndTime" TIMESTAMP(3) NOT NULL,
    "plannedManpower" INTEGER NOT NULL,
    "supervisorId" TEXT,
    "status" "PlanStatus" NOT NULL DEFAULT 'SCHEDULED',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "production_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_entries" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "hourStart" TIMESTAMP(3) NOT NULL,
    "hourEnd" TIMESTAMP(3) NOT NULL,
    "plannedCases" DOUBLE PRECISION NOT NULL,
    "actualCases" DOUBLE PRECISION NOT NULL,
    "goodCases" DOUBLE PRECISION NOT NULL,
    "rejectCases" DOUBLE PRECISION NOT NULL,
    "lossCases" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "status" "EntryStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalRemarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "production_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "downtime_entries" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "machineId" TEXT,
    "categoryId" TEXT NOT NULL,
    "reasonId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "durationMins" DOUBLE PRECISION NOT NULL,
    "actionTaken" TEXT,
    "remarks" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "downtime_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "changeover_entries" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "changeoverTypeId" TEXT NOT NULL,
    "fromProductId" TEXT NOT NULL,
    "toProductId" TEXT NOT NULL,
    "kind" "ChangeoverKind" NOT NULL DEFAULT 'PLANNED',
    "status" "ChangeoverStatus" NOT NULL DEFAULT 'COMPLETED',
    "standardMins" DOUBLE PRECISION NOT NULL,
    "actualMins" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "remarks" TEXT,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "changeover_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manpower_entries" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "headcount" INTEGER NOT NULL,
    "operators" INTEGER,
    "helpers" INTEGER,
    "remarks" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "manpower_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_closings" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "status" "ShiftClosingStatus" NOT NULL DEFAULT 'OPEN',
    "totalPlanned" DOUBLE PRECISION,
    "totalActual" DOUBLE PRECISION,
    "totalGood" DOUBLE PRECISION,
    "totalReject" DOUBLE PRECISION,
    "totalDowntime" DOUBLE PRECISION,
    "remarks" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_closings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_employeeId_key" ON "users"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_plantId_idx" ON "users"("plantId");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "plants_code_key" ON "plants"("code");

-- CreateIndex
CREATE INDEX "plants_deletedAt_idx" ON "plants"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "production_lines_code_key" ON "production_lines"("code");

-- CreateIndex
CREATE INDEX "production_lines_plantId_idx" ON "production_lines"("plantId");

-- CreateIndex
CREATE INDEX "production_lines_supervisorId_idx" ON "production_lines"("supervisorId");

-- CreateIndex
CREATE INDEX "production_lines_deletedAt_idx" ON "production_lines"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

-- CreateIndex
CREATE INDEX "products_deletedAt_idx" ON "products"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "skus_code_key" ON "skus"("code");

-- CreateIndex
CREATE INDEX "skus_productId_idx" ON "skus"("productId");

-- CreateIndex
CREATE INDEX "skus_deletedAt_idx" ON "skus"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "machines_code_key" ON "machines"("code");

-- CreateIndex
CREATE INDEX "machines_lineId_idx" ON "machines"("lineId");

-- CreateIndex
CREATE INDEX "machines_deletedAt_idx" ON "machines"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "downtime_categories_code_key" ON "downtime_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "downtime_reasons_code_key" ON "downtime_reasons"("code");

-- CreateIndex
CREATE INDEX "downtime_reasons_categoryId_idx" ON "downtime_reasons"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "changeover_types_code_key" ON "changeover_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "shifts_code_key" ON "shifts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "production_plans_planNumber_key" ON "production_plans"("planNumber");

-- CreateIndex
CREATE INDEX "production_plans_productionDate_idx" ON "production_plans"("productionDate");

-- CreateIndex
CREATE INDEX "production_plans_plantId_lineId_shiftId_idx" ON "production_plans"("plantId", "lineId", "shiftId");

-- CreateIndex
CREATE INDEX "production_plans_supervisorId_idx" ON "production_plans"("supervisorId");

-- CreateIndex
CREATE INDEX "production_plans_status_idx" ON "production_plans"("status");

-- CreateIndex
CREATE INDEX "production_plans_deletedAt_idx" ON "production_plans"("deletedAt");

-- CreateIndex
CREATE INDEX "production_entries_planId_idx" ON "production_entries"("planId");

-- CreateIndex
CREATE INDEX "production_entries_status_idx" ON "production_entries"("status");

-- CreateIndex
CREATE INDEX "production_entries_hourStart_idx" ON "production_entries"("hourStart");

-- CreateIndex
CREATE INDEX "production_entries_deletedAt_idx" ON "production_entries"("deletedAt");

-- CreateIndex
CREATE INDEX "downtime_entries_planId_idx" ON "downtime_entries"("planId");

-- CreateIndex
CREATE INDEX "downtime_entries_machineId_idx" ON "downtime_entries"("machineId");

-- CreateIndex
CREATE INDEX "downtime_entries_categoryId_idx" ON "downtime_entries"("categoryId");

-- CreateIndex
CREATE INDEX "downtime_entries_startTime_idx" ON "downtime_entries"("startTime");

-- CreateIndex
CREATE INDEX "downtime_entries_deletedAt_idx" ON "downtime_entries"("deletedAt");

-- CreateIndex
CREATE INDEX "changeover_entries_planId_idx" ON "changeover_entries"("planId");

-- CreateIndex
CREATE INDEX "changeover_entries_kind_idx" ON "changeover_entries"("kind");

-- CreateIndex
CREATE INDEX "changeover_entries_deletedAt_idx" ON "changeover_entries"("deletedAt");

-- CreateIndex
CREATE INDEX "manpower_entries_planId_idx" ON "manpower_entries"("planId");

-- CreateIndex
CREATE INDEX "shift_closings_shiftId_idx" ON "shift_closings"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "shift_closings_planId_key" ON "shift_closings"("planId");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "app_settings_key_key" ON "app_settings"("key");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_lines" ADD CONSTRAINT "production_lines_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_lines" ADD CONSTRAINT "production_lines_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skus" ADD CONSTRAINT "skus_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "production_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime_reasons" ADD CONSTRAINT "downtime_reasons_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "downtime_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "production_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_planId_fkey" FOREIGN KEY ("planId") REFERENCES "production_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime_entries" ADD CONSTRAINT "downtime_entries_planId_fkey" FOREIGN KEY ("planId") REFERENCES "production_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime_entries" ADD CONSTRAINT "downtime_entries_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime_entries" ADD CONSTRAINT "downtime_entries_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "downtime_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime_entries" ADD CONSTRAINT "downtime_entries_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "downtime_reasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime_entries" ADD CONSTRAINT "downtime_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changeover_entries" ADD CONSTRAINT "changeover_entries_planId_fkey" FOREIGN KEY ("planId") REFERENCES "production_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changeover_entries" ADD CONSTRAINT "changeover_entries_changeoverTypeId_fkey" FOREIGN KEY ("changeoverTypeId") REFERENCES "changeover_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changeover_entries" ADD CONSTRAINT "changeover_entries_fromProductId_fkey" FOREIGN KEY ("fromProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changeover_entries" ADD CONSTRAINT "changeover_entries_toProductId_fkey" FOREIGN KEY ("toProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changeover_entries" ADD CONSTRAINT "changeover_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manpower_entries" ADD CONSTRAINT "manpower_entries_planId_fkey" FOREIGN KEY ("planId") REFERENCES "production_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manpower_entries" ADD CONSTRAINT "manpower_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_closings" ADD CONSTRAINT "shift_closings_planId_fkey" FOREIGN KEY ("planId") REFERENCES "production_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_closings" ADD CONSTRAINT "shift_closings_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_closings" ADD CONSTRAINT "shift_closings_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

