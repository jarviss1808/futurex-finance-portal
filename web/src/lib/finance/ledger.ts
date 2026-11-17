export type LedgerInvoice = { id: string; totalPaise: bigint; voided?: boolean };
export type LedgerAllocation = { invoiceId: string; amountPaise: bigint; paymentVerified: boolean; paymentReversed?: boolean };

export function outstandingByInvoice(invoices: LedgerInvoice[], allocations: LedgerAllocation[]) {
  return invoices.map((invoice) => {
    const allocatedPaise = allocations
      .filter((a) => a.invoiceId === invoice.id && a.paymentVerified && !a.paymentReversed)
      .reduce((sum, a) => sum + a.amountPaise, 0n);
    const totalPaise = invoice.voided ? 0n : invoice.totalPaise;
    if (allocatedPaise > totalPaise) throw new Error(`Invoice ${invoice.id} is over-allocated`);
    return { invoiceId: invoice.id, totalPaise, allocatedPaise, outstandingPaise: totalPaise - allocatedPaise };
  });
}

export function confirmedOutstanding(invoices: LedgerInvoice[], allocations: LedgerAllocation[]): bigint {
  return outstandingByInvoice(invoices, allocations).reduce((sum, row) => sum + row.outstandingPaise, 0n);
}

export function assertAllocationAllowed(input: {
  paymentStatus: "PENDING" | "VERIFIED" | "REJECTED" | "REVERSED" | "REFUNDED";
  paymentAmountPaise: bigint;
  alreadyAllocatedPaise: bigint;
  requestedPaise: bigint;
  invoiceOutstandingPaise: bigint;
}) {
  if (input.paymentStatus !== "VERIFIED") throw new Error("Only verified payments can be allocated");
  if (input.requestedPaise <= 0n) throw new Error("Allocation must be positive");
  if (input.alreadyAllocatedPaise + input.requestedPaise > input.paymentAmountPaise) throw new Error("Payment is over-allocated");
  if (input.requestedPaise > input.invoiceOutstandingPaise) throw new Error("Invoice is over-allocated");
}
