"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

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
      { href: "/admin/consignments", label: "Consignment pipeline" },
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

function groupOpen(pathname: string, group: NavGroup) {
  return group.items.some((item) => linkActive(pathname, item.href));
}

export function AdminNav() {
  const pathname = usePathname();
  const initiallyOpen = useMemo(
    () => Object.fromEntries(GROUPS.map((group) => [group.id, groupOpen(pathname, group)])),
    [pathname],
  );
  const [open, setOpen] = useState<Record<string, boolean>>(initiallyOpen);

  return (
    <nav className="space-y-2 font-comic text-sm">
      <Link
        href="/admin"
        className={`block border-4 border-black px-3 py-2 ${
          linkActive(pathname, "/admin") ? "bg-brand-red text-white" : "bg-white"
        }`}
      >
        Live Monitor
      </Link>
      {GROUPS.map((group) => {
        const expanded = open[group.id] ?? groupOpen(pathname, group);
        return (
          <div key={group.id} className="border-4 border-black bg-white">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left font-bold"
              onClick={() => setOpen((current) => ({ ...current, [group.id]: !expanded }))}
              aria-expanded={expanded}
            >
              <span>{group.label}</span>
              <span aria-hidden>{expanded ? "−" : "+"}</span>
            </button>
            {expanded ? (
              <ul className="border-t-4 border-black">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`block px-3 py-2 ${
                        linkActive(pathname, item.href) ? "bg-brand-red text-white" : "bg-[#FFF7D1]"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
