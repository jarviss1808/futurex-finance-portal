-- Employee payment submissions can be withdrawn before approval; history stays in AuditEvent.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'WITHDRAWN';

ALTER TABLE "Payment" ADD COLUMN "remarks" TEXT;
ALTER TABLE "Payment" ADD COLUMN "submissionCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Payment" ADD COLUMN "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "Payment_organizationId_reportedById_status_idx" ON "Payment"("organizationId", "reportedById", "status");

CREATE TABLE "PaymentProof" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentProof_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentProof_storageKey_key" ON "PaymentProof"("storageKey");
CREATE INDEX "PaymentProof_paymentId_idx" ON "PaymentProof"("paymentId");
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DocumentEmailDelivery" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'DOCUMENT';
CREATE INDEX "DocumentEmailDelivery_documentId_kind_createdAt_idx" ON "DocumentEmailDelivery"("documentId", "kind", "createdAt");

CREATE INDEX "FinancialDocument_organizationId_type_issuedAt_idx" ON "FinancialDocument"("organizationId", "type", "issuedAt");
