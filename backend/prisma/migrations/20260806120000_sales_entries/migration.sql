-- CreateEnum
CREATE TYPE "SalesChannel" AS ENUM ('DISTRIBUTOR', 'RETAIL', 'MODERN_TRADE', 'EXPORT', 'OTHER');

-- CreateTable
CREATE TABLE "sales_entries" (
    "id" TEXT NOT NULL,
    "saleDate" TIMESTAMP(3) NOT NULL,
    "plantId" TEXT,
    "brandId" TEXT,
    "productId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "channel" "SalesChannel" NOT NULL DEFAULT 'DISTRIBUTOR',
    "customerName" TEXT,
    "invoiceNo" TEXT,
    "casesSold" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "sales_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_entries_saleDate_idx" ON "sales_entries"("saleDate");
CREATE INDEX "sales_entries_plantId_idx" ON "sales_entries"("plantId");
CREATE INDEX "sales_entries_brandId_idx" ON "sales_entries"("brandId");
CREATE INDEX "sales_entries_productId_idx" ON "sales_entries"("productId");
CREATE INDEX "sales_entries_skuId_idx" ON "sales_entries"("skuId");
CREATE INDEX "sales_entries_channel_idx" ON "sales_entries"("channel");
CREATE INDEX "sales_entries_deletedAt_idx" ON "sales_entries"("deletedAt");

-- AddForeignKey
ALTER TABLE "sales_entries" ADD CONSTRAINT "sales_entries_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_entries" ADD CONSTRAINT "sales_entries_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_entries" ADD CONSTRAINT "sales_entries_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_entries" ADD CONSTRAINT "sales_entries_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_entries" ADD CONSTRAINT "sales_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
