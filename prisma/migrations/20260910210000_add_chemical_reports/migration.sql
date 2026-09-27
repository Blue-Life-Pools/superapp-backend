CREATE TABLE "ChemicalReport" (
    "id" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "technicianName" TEXT NOT NULL,
    "propertyId" TEXT,
    "propertyName" TEXT NOT NULL,
    "waterBodyId" TEXT,
    "waterBodyName" TEXT,
    "tabsQuantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "liquidChlorineGallons" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "muriaticAcidGallons" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shockScoops" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dePowderBags" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bicarbonateScoops" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stabilizerScoops" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "saltBags" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "phosphatesOunces" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "validationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "excelSyncStatus" TEXT NOT NULL DEFAULT 'PENDING_CONFIGURATION',
    "excelSyncedAt" TIMESTAMP(3),
    "excelSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChemicalReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChemicalReport_serviceDate_idx" ON "ChemicalReport"("serviceDate");
CREATE INDEX "ChemicalReport_technicianName_serviceDate_idx" ON "ChemicalReport"("technicianName", "serviceDate");
CREATE INDEX "ChemicalReport_propertyId_serviceDate_idx" ON "ChemicalReport"("propertyId", "serviceDate");

ALTER TABLE "ChemicalReport"
ADD CONSTRAINT "ChemicalReport_propertyId_fkey"
FOREIGN KEY ("propertyId") REFERENCES "Property"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ChemicalReport"
ADD CONSTRAINT "ChemicalReport_waterBodyId_fkey"
FOREIGN KEY ("waterBodyId") REFERENCES "WaterBody"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
