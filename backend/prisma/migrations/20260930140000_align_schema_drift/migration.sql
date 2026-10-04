-- DropForeignKey
ALTER TABLE "changeover_entries" DROP CONSTRAINT "changeover_entries_planId_fkey";

-- AlterTable
ALTER TABLE "changeover_entries" ADD COLUMN     "fromSkuId" TEXT,
ADD COLUMN     "lineId" TEXT,
ADD COLUMN     "productionDate" DATE,
ADD COLUMN     "toSkuId" TEXT,
ALTER COLUMN "planId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "skus" ADD COLUMN     "packVolume" TEXT,
DROP COLUMN "packSize",
ADD COLUMN     "packSize" INTEGER;

-- CreateTable
CREATE TABLE "waste_materials" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultUnit" TEXT NOT NULL DEFAULT 'pcs',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "waste_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waste_entries" (
    "id" TEXT NOT NULL,
    "wasteDate" DATE NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "actualQtyIssued" DOUBLE PRECISION,
    "unit" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "remarks" TEXT,
    "shiftId" TEXT,
    "lineId" TEXT,
    "planId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "waste_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waste_materials_code_key" ON "waste_materials"("code");

-- CreateIndex
CREATE INDEX "waste_materials_deletedAt_idx" ON "waste_materials"("deletedAt");

-- CreateIndex
CREATE INDEX "waste_entries_wasteDate_idx" ON "waste_entries"("wasteDate");

-- CreateIndex
CREATE INDEX "waste_entries_materialId_idx" ON "waste_entries"("materialId");

-- CreateIndex
CREATE INDEX "waste_entries_shiftId_idx" ON "waste_entries"("shiftId");

-- CreateIndex
CREATE INDEX "waste_entries_lineId_idx" ON "waste_entries"("lineId");

-- CreateIndex
CREATE INDEX "waste_entries_planId_idx" ON "waste_entries"("planId");

-- CreateIndex
CREATE INDEX "waste_entries_deletedAt_idx" ON "waste_entries"("deletedAt");

-- CreateIndex
CREATE INDEX "changeover_entries_lineId_idx" ON "changeover_entries"("lineId");

-- CreateIndex
CREATE INDEX "changeover_entries_productionDate_idx" ON "changeover_entries"("productionDate");

-- CreateIndex
CREATE INDEX "changeover_entries_lineId_productionDate_deletedAt_idx" ON "changeover_entries"("lineId", "productionDate", "deletedAt");

-- AddForeignKey
ALTER TABLE "changeover_entries" ADD CONSTRAINT "changeover_entries_planId_fkey" FOREIGN KEY ("planId") REFERENCES "production_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changeover_entries" ADD CONSTRAINT "changeover_entries_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "production_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changeover_entries" ADD CONSTRAINT "changeover_entries_fromSkuId_fkey" FOREIGN KEY ("fromSkuId") REFERENCES "skus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changeover_entries" ADD CONSTRAINT "changeover_entries_toSkuId_fkey" FOREIGN KEY ("toSkuId") REFERENCES "skus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_entries" ADD CONSTRAINT "waste_entries_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "waste_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_entries" ADD CONSTRAINT "waste_entries_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_entries" ADD CONSTRAINT "waste_entries_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "production_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_entries" ADD CONSTRAINT "waste_entries_planId_fkey" FOREIGN KEY ("planId") REFERENCES "production_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_entries" ADD CONSTRAINT "waste_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
