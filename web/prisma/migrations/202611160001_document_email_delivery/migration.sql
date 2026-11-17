ALTER TABLE "Client" ADD COLUMN "additionalEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "DocumentEmailDelivery" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "recipients" TEXT[] NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'SENDGRID',
    "providerMessageId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    CONSTRAINT "DocumentEmailDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentEmailDelivery_organizationId_createdAt_idx" ON "DocumentEmailDelivery"("organizationId", "createdAt");
CREATE INDEX "DocumentEmailDelivery_documentId_status_createdAt_idx" ON "DocumentEmailDelivery"("documentId", "status", "createdAt");

ALTER TABLE "DocumentEmailDelivery" ADD CONSTRAINT "DocumentEmailDelivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentEmailDelivery" ADD CONSTRAINT "DocumentEmailDelivery_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "FinancialDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentEmailDelivery" ADD CONSTRAINT "DocumentEmailDelivery_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
