-- AlterTable
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "brandId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "brands" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "brands_code_key" ON "brands"("code");
CREATE INDEX IF NOT EXISTS "brands_deletedAt_idx" ON "brands"("deletedAt");
CREATE INDEX IF NOT EXISTS "products_brandId_idx" ON "products"("brandId");

DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "products_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
