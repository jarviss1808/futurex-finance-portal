ALTER TABLE "PaymentAllocation"
  ADD COLUMN "tdsPaise" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_tds_nonnegative"
  CHECK ("tdsPaise" >= 0);
