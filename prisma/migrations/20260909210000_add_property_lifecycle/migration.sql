ALTER TABLE "Property"
ADD COLUMN "lifecycleStatus" TEXT NOT NULL DEFAULT 'LEAD',
ADD COLUMN "serviceStartDate" TIMESTAMP(3),
ADD COLUMN "regularMaintenanceData" JSONB;

CREATE INDEX "Property_lifecycleStatus_idx"
ON "Property"("lifecycleStatus");
