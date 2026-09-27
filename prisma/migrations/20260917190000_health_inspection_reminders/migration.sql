CREATE TABLE "HealthInspectionReminder" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "inspectionDate" TEXT NOT NULL,
  "daysBefore" INTEGER NOT NULL,
  "recipient" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTING',
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "error" TEXT,
  CONSTRAINT "HealthInspectionReminder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HealthInspectionReminder_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "HealthTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "HealthInspectionReminder_ticketId_inspectionDate_daysBefore_key" ON "HealthInspectionReminder"("ticketId", "inspectionDate", "daysBefore");
CREATE INDEX "HealthInspectionReminder_status_idx" ON "HealthInspectionReminder"("status");
