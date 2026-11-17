CREATE TABLE "AdminMfa" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secretCiphertext" TEXT NOT NULL,
    "recoveryCodeHashes" TEXT[] NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminMfa_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminMfa_userId_key" ON "AdminMfa"("userId");

ALTER TABLE "AdminMfa" ADD CONSTRAINT "AdminMfa_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
