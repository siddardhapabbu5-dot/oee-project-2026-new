DO $$ BEGIN
  CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'CREDIT', 'ADVANCE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "sales_entries" ADD COLUMN IF NOT EXISTS "paymentMode" "PaymentMode" NOT NULL DEFAULT 'CASH';

CREATE INDEX IF NOT EXISTS "sales_entries_paymentMode_idx" ON "sales_entries"("paymentMode");
