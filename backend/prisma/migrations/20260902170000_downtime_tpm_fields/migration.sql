-- TPM / breakdown tracking fields on downtime entries
CREATE TYPE "MaintenanceType" AS ENUM ('CORRECTIVE', 'PREVENTIVE', 'BREAKDOWN', 'EMERGENCY');
CREATE TYPE "BreakdownStatus" AS ENUM ('LOGGED', 'RCA', 'CORRECTIVE_ACTION', 'VERIFIED', 'CLOSED');

ALTER TABLE "downtime_entries" ADD COLUMN "failureMode" TEXT;
ALTER TABLE "downtime_entries" ADD COLUMN "maintenanceType" "MaintenanceType";
ALTER TABLE "downtime_entries" ADD COLUMN "technician" TEXT;
ALTER TABLE "downtime_entries" ADD COLUMN "rootCause" TEXT;
ALTER TABLE "downtime_entries" ADD COLUMN "sparePartsUsed" TEXT;
ALTER TABLE "downtime_entries" ADD COLUMN "status" "BreakdownStatus" NOT NULL DEFAULT 'LOGGED';
