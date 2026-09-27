"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string };

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

const GROUPS: NavGroup[] = [
  {
    id: "auctions",
    label: "Auctions & Inventory",
    items: [
      { href: "/admin/inventories", label: "Auction inventories" },
      { href: "/admin/auctions", label: "Auction desk" },
      { href: "/admin/intake", label: "Warehouse AI generator" },
      { href: "/admin/buy-now", label: "Buy Now" },
      { href: "/admin/consignments", label: "Consignment pipeline" },
      { href: "/operations-guide", label: "Operations guide" },
    ],
  },
  {
    id: "customers",
    label: "Customers & Marketing",
    items: [
      { href: "/admin/customers", label: "Customer directory" },
      { href: "/admin/email", label: "Email engine" },
    ],
  },
];

function linkActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin" || pathname === "/admin/live";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function navClass(active: boolean) {
  return `border-4 border-black px-3 py-2 ${active ? "bg-brand-red text-white" : "bg-white"}`;
}

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex min-w-0 flex-1 flex-wrap gap-2 font-comic text-sm">
      <Link href="/admin" className={navClass(linkActive(pathname, "/admin"))}>
        Live Monitor
      </Link>
      {GROUPS.flatMap((group) => group.items).map((item) => (
        <Link key={item.href} href={item.href} className={navClass(linkActive(pathname, item.href))}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
