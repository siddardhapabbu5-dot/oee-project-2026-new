-- Add pack volume + pack size (units per case)
ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "packVolume" TEXT;
ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "packSize" INTEGER;

-- Derive volume from code/name, then set pack size:
-- 250 ML → 30, 500 ML → 24, 1000 ML → 12
UPDATE skus SET
  "packVolume" = CASE
    WHEN UPPER(code) LIKE '%250%' OR UPPER(name) LIKE '%250%ML%' OR UPPER(name) LIKE '%250 ML%' THEN '250 ML'
    WHEN UPPER(code) LIKE '%500%' OR UPPER(name) LIKE '%500%ML%' OR UPPER(name) LIKE '%500 ML%' THEN '500 ML'
    WHEN UPPER(code) LIKE '%1000%' OR UPPER(name) LIKE '%1000%ML%' OR UPPER(name) LIKE '%1000 ML%' THEN '1000 ML'
    WHEN UPPER(code) LIKE '%2000%' OR UPPER(name) LIKE '%2000%ML%' OR UPPER(name) LIKE '%2000 ML%' THEN '2000 ML'
    WHEN UPPER(name) LIKE '%20 L%' OR UPPER(code) LIKE '%20L%' OR UPPER(name) LIKE '%20L%' THEN '20 L'
    ELSE "packVolume"
  END,
  "packSize" = CASE
    WHEN UPPER(code) LIKE '%250%' OR UPPER(name) LIKE '%250%ML%' OR UPPER(name) LIKE '%250 ML%' THEN 30
    WHEN UPPER(code) LIKE '%500%' OR UPPER(name) LIKE '%500%ML%' OR UPPER(name) LIKE '%500 ML%' THEN 24
    WHEN UPPER(code) LIKE '%1000%' OR UPPER(name) LIKE '%1000%ML%' OR UPPER(name) LIKE '%1000 ML%' THEN 12
    WHEN UPPER(code) LIKE '%2000%' OR UPPER(name) LIKE '%2000%ML%' OR UPPER(name) LIKE '%2000 ML%' THEN 6
    WHEN UPPER(name) LIKE '%20 L%' OR UPPER(code) LIKE '%20L%' OR UPPER(name) LIKE '%20L%' THEN 1
    ELSE "packSize"
  END,
  "updatedAt" = NOW()
WHERE "deletedAt" IS NULL;
