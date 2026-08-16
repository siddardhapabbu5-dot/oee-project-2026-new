-- CreateTable
CREATE TABLE "reject_areas" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortLabel" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "reject_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reject_types" (
    "id" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "example" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "reject_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rft_entries" (
    "id" TEXT NOT NULL,
    "entryDate" DATE NOT NULL,
    "plantId" TEXT,
    "lineId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "totalProduced" DOUBLE PRECISION NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "rft_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rft_reject_qtys" (
    "id" TEXT NOT NULL,
    "rftEntryId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "rejectTypeId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "rft_reject_qtys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reject_areas_code_key" ON "reject_areas"("code");
CREATE INDEX "reject_areas_sortOrder_idx" ON "reject_areas"("sortOrder");
CREATE INDEX "reject_areas_deletedAt_idx" ON "reject_areas"("deletedAt");

CREATE INDEX "reject_types_areaId_idx" ON "reject_types"("areaId");
CREATE INDEX "reject_types_deletedAt_idx" ON "reject_types"("deletedAt");
CREATE UNIQUE INDEX "reject_types_areaId_code_key" ON "reject_types"("areaId", "code");

CREATE INDEX "rft_entries_entryDate_idx" ON "rft_entries"("entryDate");
CREATE INDEX "rft_entries_lineId_idx" ON "rft_entries"("lineId");
CREATE INDEX "rft_entries_shiftId_idx" ON "rft_entries"("shiftId");
CREATE INDEX "rft_entries_productId_idx" ON "rft_entries"("productId");
CREATE INDEX "rft_entries_skuId_idx" ON "rft_entries"("skuId");
CREATE INDEX "rft_entries_deletedAt_idx" ON "rft_entries"("deletedAt");
CREATE UNIQUE INDEX "rft_entries_entryDate_lineId_shiftId_skuId_key" ON "rft_entries"("entryDate", "lineId", "shiftId", "skuId");

CREATE INDEX "rft_reject_qtys_rftEntryId_idx" ON "rft_reject_qtys"("rftEntryId");
CREATE INDEX "rft_reject_qtys_areaId_idx" ON "rft_reject_qtys"("areaId");
CREATE INDEX "rft_reject_qtys_rejectTypeId_idx" ON "rft_reject_qtys"("rejectTypeId");
CREATE INDEX "rft_reject_qtys_deletedAt_idx" ON "rft_reject_qtys"("deletedAt");

-- AddForeignKey
ALTER TABLE "reject_types" ADD CONSTRAINT "reject_types_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "reject_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rft_entries" ADD CONSTRAINT "rft_entries_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rft_entries" ADD CONSTRAINT "rft_entries_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "production_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rft_entries" ADD CONSTRAINT "rft_entries_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rft_entries" ADD CONSTRAINT "rft_entries_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rft_entries" ADD CONSTRAINT "rft_entries_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rft_entries" ADD CONSTRAINT "rft_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "rft_reject_qtys" ADD CONSTRAINT "rft_reject_qtys_rftEntryId_fkey" FOREIGN KEY ("rftEntryId") REFERENCES "rft_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rft_reject_qtys" ADD CONSTRAINT "rft_reject_qtys_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "reject_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rft_reject_qtys" ADD CONSTRAINT "rft_reject_qtys_rejectTypeId_fkey" FOREIGN KEY ("rejectTypeId") REFERENCES "reject_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
