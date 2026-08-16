-- CreateEnum
CREATE TYPE "ReworkZone" AS ENUM ('BLOW_MOULD', 'FILLER', 'CAPPER', 'LABEL', 'PACKAGING', 'OTHER');

-- CreateTable
CREATE TABLE "rework_entries" (
    "id" TEXT NOT NULL,
    "productionEntryId" TEXT NOT NULL,
    "zone" "ReworkZone" NOT NULL,
    "reworkCases" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "rework_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rework_entries_productionEntryId_idx" ON "rework_entries"("productionEntryId");

-- CreateIndex
CREATE INDEX "rework_entries_zone_idx" ON "rework_entries"("zone");

-- CreateIndex
CREATE INDEX "rework_entries_deletedAt_idx" ON "rework_entries"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "rework_entries_productionEntryId_zone_key" ON "rework_entries"("productionEntryId", "zone");

-- AddForeignKey
ALTER TABLE "rework_entries" ADD CONSTRAINT "rework_entries_productionEntryId_fkey" FOREIGN KEY ("productionEntryId") REFERENCES "production_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
