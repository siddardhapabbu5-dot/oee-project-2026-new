-- Add packSize to skus
ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "packSize" TEXT;
