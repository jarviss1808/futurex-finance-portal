ALTER TABLE "Event" ADD COLUMN "taxRuleId" TEXT;
ALTER TABLE "CompanyProfile" ADD COLUMN "gstRegisteredAddress" TEXT NOT NULL DEFAULT '';

ALTER TABLE "Event"
ADD CONSTRAINT "Event_taxRuleId_fkey"
FOREIGN KEY ("taxRuleId") REFERENCES "TaxRule"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Event_taxRuleId_idx" ON "Event"("taxRuleId");
