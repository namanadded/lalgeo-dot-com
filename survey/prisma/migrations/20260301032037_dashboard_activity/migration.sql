-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "paidAt" DATETIME;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "inspectionDueDate" DATETIME;
ALTER TABLE "Job" ADD COLUMN "scheduledStart" DATETIME;

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actorUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Activity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Activity_organizationId_createdAt_idx" ON "Activity"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_organizationId_entityType_entityId_createdAt_idx" ON "Activity"("organizationId", "entityType", "entityId", "createdAt");
