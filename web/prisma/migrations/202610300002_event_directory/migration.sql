CREATE TYPE "EventType" AS ENUM ('OWNED', 'EXTERNAL');

ALTER TABLE "Event"
ADD COLUMN "canonicalKey" TEXT,
ADD COLUMN "type" "EventType" NOT NULL DEFAULT 'OWNED',
ADD COLUMN "stateRegion" TEXT,
ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
ADD COLUMN "website" TEXT,
ADD COLUMN "posterImageKey" TEXT;

CREATE UNIQUE INDEX "Event_organizationId_canonicalKey_key"
ON "Event"("organizationId", "canonicalKey");
