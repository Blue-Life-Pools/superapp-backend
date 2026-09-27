ALTER TABLE "ReportIncident" ADD COLUMN "propertyId" TEXT;

CREATE TABLE "ReportAttachment" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sharepointItemId" TEXT NOT NULL,
    "sharepointWebUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReportAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReportIncident_propertyId_idx" ON "ReportIncident"("propertyId");
CREATE INDEX "ReportAttachment_incidentId_createdAt_idx" ON "ReportAttachment"("incidentId", "createdAt");

ALTER TABLE "ReportIncident" ADD CONSTRAINT "ReportIncident_propertyId_fkey"
FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReportAttachment" ADD CONSTRAINT "ReportAttachment_incidentId_fkey"
FOREIGN KEY ("incidentId") REFERENCES "ReportIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
