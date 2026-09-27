CREATE TABLE "ReportPerson" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT,
    "defaultSupervisorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReportPerson_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportIncidentType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReportIncidentType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportIncident" (
    "id" TEXT NOT NULL,
    "occurredAt" DATE NOT NULL,
    "propertyName" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "importance" TEXT NOT NULL DEFAULT 'MEDIUM',
    "description" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "requiresInspector" BOOLEAN NOT NULL DEFAULT false,
    "inspectorId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resolution" TEXT,
    "solvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReportIncident_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportPerson_role_name_key" ON "ReportPerson"("role", "name");
CREATE INDEX "ReportPerson_role_active_idx" ON "ReportPerson"("role", "active");
CREATE UNIQUE INDEX "ReportIncidentType_name_key" ON "ReportIncidentType"("name");
CREATE INDEX "ReportIncident_occurredAt_idx" ON "ReportIncident"("occurredAt");
CREATE INDEX "ReportIncident_status_occurredAt_idx" ON "ReportIncident"("status", "occurredAt");
CREATE INDEX "ReportIncident_propertyName_idx" ON "ReportIncident"("propertyName");

ALTER TABLE "ReportPerson" ADD CONSTRAINT "ReportPerson_defaultSupervisorId_fkey" FOREIGN KEY ("defaultSupervisorId") REFERENCES "ReportPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReportIncident" ADD CONSTRAINT "ReportIncident_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ReportIncidentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportIncident" ADD CONSTRAINT "ReportIncident_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "ReportPerson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportIncident" ADD CONSTRAINT "ReportIncident_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "ReportPerson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportIncident" ADD CONSTRAINT "ReportIncident_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "ReportPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
