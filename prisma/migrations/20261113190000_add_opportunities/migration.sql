CREATE TABLE "Opportunity" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT,
  "propertyName" TEXT NOT NULL,
  "linkedPropertyName" TEXT,
  "estimateNumber" TEXT,
  "estimateAmount" DECIMAL(14,2),
  "status" TEXT,
  "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "contractor" TEXT,
  "name" TEXT,
  "creationDate" DATE,
  "requestedBy" TEXT,
  "approvalDate" DATE,
  "approvedBy" TEXT,
  "estimatedRepairDate" DATE,
  "inSkimmer" BOOLEAN,
  "assignedTechnician" TEXT,
  "actualRepairDate" DATE,
  "invoiceNumber" TEXT,
  "invoiceAmount" DECIMAL(14,2),
  "invoiceDate" DATE,
  "approvalTime" TEXT,
  "repairTime" TEXT,
  "invoiceTime" TEXT,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "sourceRecordId" TEXT NOT NULL,
  "sourceMailbox" TEXT,
  "receivedAt" TIMESTAMP(3),
  "sourceMetadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Opportunity_source_sourceRecordId_key" ON "Opportunity"("source", "sourceRecordId");
CREATE INDEX "Opportunity_creationDate_idx" ON "Opportunity"("creationDate");
CREATE INDEX "Opportunity_status_idx" ON "Opportunity"("status");
CREATE INDEX "Opportunity_propertyId_idx" ON "Opportunity"("propertyId");
CREATE INDEX "Opportunity_estimateNumber_idx" ON "Opportunity"("estimateNumber");
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
