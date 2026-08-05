-- Add bottlesPerHour for SKU-wise production targets
ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "bottlesPerHour" INTEGER;

-- Default existing catalog SKUs to plant rated speed
UPDATE "skus" SET "bottlesPerHour" = 5400 WHERE "bottlesPerHour" IS NULL AND "deletedAt" IS NULL;
