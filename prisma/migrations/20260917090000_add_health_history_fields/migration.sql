ALTER TABLE "HealthTicket" ADD COLUMN "conversationId" TEXT;
ALTER TABLE "HealthTicket" ADD COLUMN "healthData" JSONB;
CREATE INDEX "HealthTicket_conversationId_idx" ON "HealthTicket"("conversationId");
