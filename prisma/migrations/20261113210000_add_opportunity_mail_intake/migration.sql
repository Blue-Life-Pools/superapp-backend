CREATE TABLE "OpportunityMailConnection" (
  "id" TEXT NOT NULL DEFAULT 'estimates',
  "mailbox" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "lastScannedAt" TIMESTAMP(3),
  "nextLink" TEXT,
  "scanThrough" TIMESTAMP(3),
  "lastSyncAt" TIMESTAMP(3),
  "lastScheduledSyncAt" TIMESTAMP(3),
  "lastError" TEXT,
  "lastCreated" INTEGER NOT NULL DEFAULT 0,
  "lastLinked" INTEGER NOT NULL DEFAULT 0,
  "lastReview" INTEGER NOT NULL DEFAULT 0,
  "lockOwner" TEXT,
  "lockUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OpportunityMailConnection_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OpportunityEmailReceipt" (
  "id" TEXT NOT NULL,
  "mailbox" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "estimateNumber" TEXT,
  "propertyName" TEXT,
  "status" TEXT NOT NULL,
  "reason" TEXT,
  "parsedFields" JSONB,
  "bodyText" TEXT,
  "opportunityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpportunityEmailReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OpportunityEmailReceipt_mailbox_messageId_key" ON "OpportunityEmailReceipt"("mailbox", "messageId");
CREATE INDEX "OpportunityEmailReceipt_status_receivedAt_idx" ON "OpportunityEmailReceipt"("status", "receivedAt");
CREATE INDEX "OpportunityEmailReceipt_opportunityId_idx" ON "OpportunityEmailReceipt"("opportunityId");
ALTER TABLE "OpportunityEmailReceipt" ADD CONSTRAINT "OpportunityEmailReceipt_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
