import { piBalance } from "@/lib/reports/balances";

type ListRow = { totalPaise: bigint; tdsPaise: bigint; netReceivablePaise: bigint; status: string; allocations: Array<{ amountPaise: bigint; payment: { status: string } }> };

/** JSON-safe document list row: money as decimal strings of paise, payment allocations summarised. */
export function documentListJson<T extends ListRow>({ allocations, ...row }: T) {
  const balance = piBalance(row.netReceivablePaise, row.status, allocations.map((item) => ({ amountPaise: item.amountPaise, status: item.payment.status })));
  return { ...row, totalPaise: row.totalPaise.toString(), tdsPaise: row.tdsPaise.toString(), netReceivablePaise: row.netReceivablePaise.toString(), approvedPaise: balance.approved.toString(), outstandingPaise: balance.outstanding.toString() };
}
