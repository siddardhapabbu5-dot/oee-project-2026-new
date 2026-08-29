CREATE TABLE IF NOT EXISTS "petty_cash_entries" (
    "id" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "voucherNo" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "received" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "approvedBy" TEXT,
    "remarks" TEXT,
    "plantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    CONSTRAINT "petty_cash_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "petty_cash_entries_voucherNo_key" ON "petty_cash_entries"("voucherNo");
CREATE INDEX IF NOT EXISTS "petty_cash_entries_entryDate_idx" ON "petty_cash_entries"("entryDate");
CREATE INDEX IF NOT EXISTS "petty_cash_entries_category_idx" ON "petty_cash_entries"("category");
CREATE INDEX IF NOT EXISTS "petty_cash_entries_plantId_idx" ON "petty_cash_entries"("plantId");
CREATE INDEX IF NOT EXISTS "petty_cash_entries_deletedAt_idx" ON "petty_cash_entries"("deletedAt");

DO $$ BEGIN
  ALTER TABLE "petty_cash_entries" ADD CONSTRAINT "petty_cash_entries_plantId_fkey"
    FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "petty_cash_entries" ADD CONSTRAINT "petty_cash_entries_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
