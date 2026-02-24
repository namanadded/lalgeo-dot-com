-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "provider" TEXT,
    "status" TEXT NOT NULL,
    "recipientTo" TEXT NOT NULL,
    "recipientCc" TEXT,
    "subject" TEXT NOT NULL,
    "errorMessage" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EmailLog_organizationId_documentType_documentId_createdAt_idx" ON "EmailLog"("organizationId", "documentType", "documentId", "createdAt");
