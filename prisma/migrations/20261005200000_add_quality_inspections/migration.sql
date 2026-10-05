CREATE TABLE "QualityInspection" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "waterBodyId" TEXT,
    "technicianName" TEXT NOT NULL,
    "visitDate" TIMESTAMP(3) NOT NULL,
    "readings" JSONB,
    "notes" TEXT,
    "photos" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QualityInspection_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "QualityFinding" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QualityFinding_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "QualityInspection_propertyId_visitDate_idx" ON "QualityInspection"("propertyId", "visitDate");
CREATE INDEX "QualityInspection_visitDate_idx" ON "QualityInspection"("visitDate");
CREATE INDEX "QualityFinding_inspectionId_idx" ON "QualityFinding"("inspectionId");
CREATE INDEX "QualityFinding_status_idx" ON "QualityFinding"("status");
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_waterBodyId_fkey" FOREIGN KEY ("waterBodyId") REFERENCES "WaterBody"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QualityFinding" ADD CONSTRAINT "QualityFinding_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "QualityInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
