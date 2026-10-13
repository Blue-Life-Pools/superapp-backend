CREATE TABLE "ChemicalConsumptionPeriod" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "monthlyFee" DECIMAL(12,2),
  "feeSource" TEXT,
  "chemicals" JSONB NOT NULL DEFAULT '[]',
  "sourceName" TEXT,
  "budgetPercent" DOUBLE PRECISION,
  "seasonFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "references" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChemicalConsumptionPeriod_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChemicalConsumptionPeriod_propertyId_month_key" ON "ChemicalConsumptionPeriod"("propertyId", "month");
CREATE INDEX "ChemicalConsumptionPeriod_month_idx" ON "ChemicalConsumptionPeriod"("month");
ALTER TABLE "ChemicalConsumptionPeriod" ADD CONSTRAINT "ChemicalConsumptionPeriod_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
