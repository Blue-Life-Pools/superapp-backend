ALTER TABLE "OpportunityMailConnection"
  ADD COLUMN "subscriptionId" TEXT,
  ADD COLUMN "subscriptionClientState" TEXT,
  ADD COLUMN "subscriptionExpiresAt" TIMESTAMP(3),
  ADD COLUMN "subscriptionError" TEXT,
  ADD COLUMN "subscriptionLockOwner" TEXT,
  ADD COLUMN "subscriptionLockUntil" TIMESTAMP(3),
  ADD COLUMN "lastNotificationAt" TIMESTAMP(3),
  ADD COLUMN "lastNotificationProcessedAt" TIMESTAMP(3),
  ADD COLUMN "lastMaintenanceAt" TIMESTAMP(3),
  ADD COLUMN "notificationError" TEXT,
  ADD COLUMN "recoveryRequestedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "OpportunityMailConnection_subscriptionId_key" ON "OpportunityMailConnection"("subscriptionId");
CREATE TABLE "OpportunityMailNotification" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "messageId" TEXT,
  "lifecycleEvent" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockOwner" TEXT,
  "lockUntil" TIMESTAMP(3),
  "lastError" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpportunityMailNotification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OpportunityMailNotification_eventKey_key" ON "OpportunityMailNotification"("eventKey");
CREATE INDEX "OpportunityMailNotification_status_availableAt_createdAt_idx" ON "OpportunityMailNotification"("status", "availableAt", "createdAt");
