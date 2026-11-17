-- Add the canonical company registry without discarding existing employee-private clients.
CREATE TABLE "CompanyMaster" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "canonicalKey" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "billingAddress" TEXT NOT NULL,
    "gstin" TEXT,
    "defaultCurrency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyMaster_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyMaster_organizationId_canonicalKey_key"
ON "CompanyMaster"("organizationId", "canonicalKey");
CREATE INDEX "CompanyMaster_organizationId_normalizedName_idx"
ON "CompanyMaster"("organizationId", "normalizedName");

ALTER TABLE "CompanyMaster" ADD CONSTRAINT "CompanyMaster_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Client"
ADD COLUMN "masterId" TEXT,
ADD COLUMN "countryCode" TEXT NOT NULL DEFAULT 'IN',
ADD COLUMN "defaultCurrency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN "privateNotes" TEXT;

-- Preserve all existing client data while consolidating only the non-private company identity.
INSERT INTO "CompanyMaster" (
    "id", "organizationId", "canonicalKey", "legalName", "normalizedName",
    "countryCode", "billingAddress", "gstin", "defaultCurrency", "updatedAt"
)
SELECT
    MIN("id"), "organizationId",
    CASE WHEN "gstin" IS NOT NULL AND "gstin" <> '' THEN 'GSTIN:' || "gstin" ELSE 'NAME:' || "normalizedName" || ':IN' END,
    MIN("legalName"), "normalizedName", 'IN', MIN("billingAddress"), NULLIF(MIN(COALESCE("gstin", '')), ''), 'INR', CURRENT_TIMESTAMP
FROM "Client"
GROUP BY "organizationId", "normalizedName", "gstin";

UPDATE "Client" AS c
SET "masterId" = m."id"
FROM "CompanyMaster" AS m
WHERE m."organizationId" = c."organizationId"
  AND m."canonicalKey" = CASE WHEN c."gstin" IS NOT NULL AND c."gstin" <> '' THEN 'GSTIN:' || c."gstin" ELSE 'NAME:' || c."normalizedName" || ':IN' END;

ALTER TABLE "Client" ALTER COLUMN "masterId" SET NOT NULL;
DROP INDEX "Client_organizationId_normalizedName_gstin_key";
CREATE UNIQUE INDEX "Client_masterId_ownerId_key" ON "Client"("masterId", "ownerId");
ALTER TABLE "Client" ADD CONSTRAINT "Client_masterId_fkey"
FOREIGN KEY ("masterId") REFERENCES "CompanyMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

