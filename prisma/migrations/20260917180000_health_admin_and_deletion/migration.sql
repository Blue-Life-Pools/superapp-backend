ALTER TABLE "HealthTicket" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE TABLE "HealthAdmin" ("id" TEXT NOT NULL, "email" TEXT NOT NULL, "passwordHash" TEXT NOT NULL, CONSTRAINT "HealthAdmin_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "HealthAdmin_email_key" ON "HealthAdmin"("email");
