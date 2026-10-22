CREATE TABLE "ChemicalConsumptionMaximum" (
    "id" TEXT NOT NULL,
    "propertyCode" TEXT NOT NULL,
    "propertyName" TEXT NOT NULL,
    "chemicalName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "maximum" DOUBLE PRECISION NOT NULL,
    "recordedMonths" INTEGER NOT NULL,
    "excludedMonths" INTEGER NOT NULL,
    "sourceName" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChemicalConsumptionMaximum_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ChemicalConsumptionMaximum_valid_maximum" CHECK ("maximum" >= 0 AND "maximum" < 'Infinity'::float8),
    CONSTRAINT "ChemicalConsumptionMaximum_valid_months" CHECK ("recordedMonths" >= 0 AND "excludedMonths" >= 0 AND "excludedMonths" <= "recordedMonths")
);

CREATE UNIQUE INDEX "ChemicalConsumptionMaximum_propertyCode_chemicalName_unit_key"
ON "ChemicalConsumptionMaximum"("propertyCode", "chemicalName", "unit");
