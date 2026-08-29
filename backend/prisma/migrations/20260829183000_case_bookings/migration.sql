DO $$ BEGIN
  CREATE TYPE "CaseBookingStatus" AS ENUM ('BOOKED', 'DELIVERED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "case_bookings" (
  "id" TEXT NOT NULL,
  "bookingDate" TIMESTAMP(3) NOT NULL,
  "deliveryDate" TIMESTAMP(3) NOT NULL,
  "plantId" TEXT,
  "brandId" TEXT,
  "productId" TEXT NOT NULL,
  "skuId" TEXT NOT NULL,
  "distributorId" TEXT,
  "customerName" TEXT,
  "casesBooked" DOUBLE PRECISION NOT NULL,
  "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" "CaseBookingStatus" NOT NULL DEFAULT 'BOOKED',
  "remarks" TEXT,
  "salesEntryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdById" TEXT,

  CONSTRAINT "case_bookings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "case_bookings_bookingDate_idx" ON "case_bookings"("bookingDate");
CREATE INDEX IF NOT EXISTS "case_bookings_deliveryDate_idx" ON "case_bookings"("deliveryDate");
CREATE INDEX IF NOT EXISTS "case_bookings_plantId_idx" ON "case_bookings"("plantId");
CREATE INDEX IF NOT EXISTS "case_bookings_productId_idx" ON "case_bookings"("productId");
CREATE INDEX IF NOT EXISTS "case_bookings_skuId_idx" ON "case_bookings"("skuId");
CREATE INDEX IF NOT EXISTS "case_bookings_distributorId_idx" ON "case_bookings"("distributorId");
CREATE INDEX IF NOT EXISTS "case_bookings_status_idx" ON "case_bookings"("status");
CREATE INDEX IF NOT EXISTS "case_bookings_deletedAt_idx" ON "case_bookings"("deletedAt");

ALTER TABLE "case_bookings" DROP CONSTRAINT IF EXISTS "case_bookings_plantId_fkey";
ALTER TABLE "case_bookings" ADD CONSTRAINT "case_bookings_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "case_bookings" DROP CONSTRAINT IF EXISTS "case_bookings_brandId_fkey";
ALTER TABLE "case_bookings" ADD CONSTRAINT "case_bookings_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "case_bookings" DROP CONSTRAINT IF EXISTS "case_bookings_productId_fkey";
ALTER TABLE "case_bookings" ADD CONSTRAINT "case_bookings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "case_bookings" DROP CONSTRAINT IF EXISTS "case_bookings_skuId_fkey";
ALTER TABLE "case_bookings" ADD CONSTRAINT "case_bookings_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "case_bookings" DROP CONSTRAINT IF EXISTS "case_bookings_distributorId_fkey";
ALTER TABLE "case_bookings" ADD CONSTRAINT "case_bookings_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "distributors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "case_bookings" DROP CONSTRAINT IF EXISTS "case_bookings_salesEntryId_fkey";
ALTER TABLE "case_bookings" ADD CONSTRAINT "case_bookings_salesEntryId_fkey" FOREIGN KEY ("salesEntryId") REFERENCES "sales_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "case_bookings" DROP CONSTRAINT IF EXISTS "case_bookings_createdById_fkey";
ALTER TABLE "case_bookings" ADD CONSTRAINT "case_bookings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
