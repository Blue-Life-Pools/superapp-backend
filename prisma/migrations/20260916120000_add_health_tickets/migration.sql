CREATE TABLE "HealthTicket" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "outlookMessageId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "propertyName" TEXT,
    "senderEmail" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "visitDate" TIMESTAMP(3),
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "estimateStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "bodyPreview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HealthTicket_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HealthTicket_ticketNumber_key" ON "HealthTicket"("ticketNumber");
CREATE UNIQUE INDEX "HealthTicket_outlookMessageId_key" ON "HealthTicket"("outlookMessageId");
CREATE INDEX "HealthTicket_status_idx" ON "HealthTicket"("status");
CREATE INDEX "HealthTicket_visitDate_idx" ON "HealthTicket"("visitDate");
