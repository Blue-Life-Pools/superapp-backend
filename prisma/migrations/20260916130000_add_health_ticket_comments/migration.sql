CREATE TABLE "HealthTicketComment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HealthTicketComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HealthTicketComment_ticketId_createdAt_idx" ON "HealthTicketComment"("ticketId", "createdAt");
ALTER TABLE "HealthTicketComment" ADD CONSTRAINT "HealthTicketComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "HealthTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
