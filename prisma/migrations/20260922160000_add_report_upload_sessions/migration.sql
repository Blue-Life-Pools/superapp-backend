CREATE TABLE "ReportUploadSession" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "uploadUrl" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "uploadFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "nextByte" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReportUploadSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReportUploadSession_incidentId_createdAt_idx" ON "ReportUploadSession"("incidentId", "createdAt");

ALTER TABLE "ReportUploadSession" ADD CONSTRAINT "ReportUploadSession_incidentId_fkey"
FOREIGN KEY ("incidentId") REFERENCES "ReportIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
