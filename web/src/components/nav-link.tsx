"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children, exact = false, badge = 0, badgeTitle }: { href: string; children: React.ReactNode; exact?: boolean; badge?: number; badgeTitle?: string }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || (pathname.startsWith(`${href}/`) && !(href === "/documents" && pathname === "/documents/new") && !(href === "/reports" && pathname.startsWith("/reports/ledger")));
  return <Link href={href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
    <span>{children}</span>
    {badge > 0 && <em className="nav-badge" title={badgeTitle}>{badge > 99 ? "99+" : badge}</em>}
  </Link>;
}
