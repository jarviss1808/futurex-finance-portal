CREATE TYPE "PiCategory" AS ENUM (
  'EXHIBITION_PARTICIPATION',
  'BRANDING_FLEX_FRAME',
  'EXTRA_REQUIREMENTS',
  'STALL_FABRICATION'
);

ALTER TABLE "FinancialDocument" ADD COLUMN "piCategory" "PiCategory";

UPDATE "FinancialDocument"
SET "piCategory" = CASE
  WHEN "type" = 'PROFORMA' AND COALESCE("snapshot"->>'purpose', '') = 'ADDITIONAL_ITEMS' THEN 'EXTRA_REQUIREMENTS'::"PiCategory"
  WHEN "type" = 'PROFORMA' THEN 'EXHIBITION_PARTICIPATION'::"PiCategory"
  ELSE NULL
END;

CREATE INDEX "FinancialDocument_organizationId_piCategory_issuedAt_idx"
ON "FinancialDocument"("organizationId", "piCategory", "issuedAt");
