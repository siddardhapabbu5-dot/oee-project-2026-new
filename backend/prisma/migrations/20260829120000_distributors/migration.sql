CREATE TABLE IF NOT EXISTS "distributors" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "area" TEXT,
    "remarks" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "distributors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "distributors_code_key" ON "distributors"("code");
CREATE INDEX IF NOT EXISTS "distributors_name_idx" ON "distributors"("name");
CREATE INDEX IF NOT EXISTS "distributors_deletedAt_idx" ON "distributors"("deletedAt");

ALTER TABLE "sales_entries" ADD COLUMN IF NOT EXISTS "distributorId" TEXT;

CREATE INDEX IF NOT EXISTS "sales_entries_distributorId_idx" ON "sales_entries"("distributorId");

DO $$ BEGIN
  ALTER TABLE "sales_entries" ADD CONSTRAINT "sales_entries_distributorId_fkey"
    FOREIGN KEY ("distributorId") REFERENCES "distributors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
