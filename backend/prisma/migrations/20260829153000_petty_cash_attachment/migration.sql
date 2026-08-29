ALTER TABLE "petty_cash_entries" ADD COLUMN IF NOT EXISTS "attachmentName" TEXT;
ALTER TABLE "petty_cash_entries" ADD COLUMN IF NOT EXISTS "attachmentMime" TEXT;
ALTER TABLE "petty_cash_entries" ADD COLUMN IF NOT EXISTS "attachmentPath" TEXT;
