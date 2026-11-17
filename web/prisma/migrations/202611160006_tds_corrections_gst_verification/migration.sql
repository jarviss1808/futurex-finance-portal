ALTER TABLE "FinancialDocument"
  ADD COLUMN "tdsPaise" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "netReceivablePaise" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "correctedSnapshot" JSONB,
  ADD COLUMN "correctionVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "correctionReason" TEXT,
  ADD COLUMN "correctedAt" TIMESTAMP(3),
  ADD COLUMN "correctedById" TEXT;

UPDATE "FinancialDocument" SET "netReceivablePaise" = "totalPaise";

ALTER TABLE "Client"
  ADD COLUMN "gstTradeName" TEXT,
  ADD COLUMN "gstRegistrationStatus" TEXT,
  ADD COLUMN "gstVerificationSource" TEXT,
  ADD COLUMN "gstVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "gstVerifiedById" TEXT;

CREATE INDEX "FinancialDocument_correctedById_idx" ON "FinancialDocument"("correctedById");
CREATE INDEX "Client_gstVerifiedById_idx" ON "Client"("gstVerifiedById");

ALTER TABLE "FinancialDocument" ADD CONSTRAINT "FinancialDocument_correctedById_fkey"
  FOREIGN KEY ("correctedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_gstVerifiedById_fkey"
  FOREIGN KEY ("gstVerifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialDocument" ADD CONSTRAINT "FinancialDocument_tds_bounds"
  CHECK ("tdsPaise" >= 0 AND "netReceivablePaise" >= 0 AND "netReceivablePaise" = "totalPaise" - "tdsPaise");
ALTER TABLE "FinancialDocument" ADD CONSTRAINT "FinancialDocument_one_correction"
  CHECK ("correctionVersion" IN (0, 1));
