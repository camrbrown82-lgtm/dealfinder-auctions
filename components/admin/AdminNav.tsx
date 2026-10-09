"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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
      { href: "/admin/stream", label: "Floor stream" },
      { href: "/admin/buy-now", label: "Buy Now" },
      { href: "/admin/shipping", label: "Pickup & shipping" },
      { href: "/admin/settlements", label: "Settlements" },
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

function groupOpen(pathname: string, group: NavGroup) {
  return group.items.some((item) => linkActive(pathname, item.href));
}

function useWaitingCount() {
  const [count, setCount] = useState({ total: 0, consignments: 0 });
  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const response = await fetch("/api/admin/notifications", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) return;
        const json = (await response.json()) as {
          counts?: { total?: number; consignments?: number };
        };
        if (live) {
          setCount({
            total: Number(json.counts?.total ?? 0),
            consignments: Number(json.counts?.consignments ?? 0),
          });
        }
      } catch {
        /* leave the badge as it is */
      }
    }
    void load();
    const poll = window.setInterval(() => void load(), 30000);
    return () => {
      live = false;
      window.clearInterval(poll);
    };
  }, []);
  return count;
}

export function AdminNav() {
  const pathname = usePathname();
  const waiting = useWaitingCount();
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
      <Link
        href="/admin/notifications"
        className={`flex items-center justify-between gap-2 border-4 border-black px-3 py-2 ${
          linkActive(pathname, "/admin/notifications") ? "bg-brand-red text-white" : "bg-white"
        }`}
      >
        <span className="font-bold">Notifications</span>
        <span
          className={`min-w-6 border-2 border-black px-2 text-center font-bold ${
            waiting.total > 0 ? "bg-brand-red text-white" : "bg-[#FFF7D1] text-black"
          }`}
        >
          {waiting.total}
        </span>
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
                {group.items.map((item) => {
                  // A submission waiting for approval shows up on the desk you work from.
                  const badge =
                    item.href === "/admin/consignments" && waiting.consignments > 0
                      ? waiting.consignments
                      : 0;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center justify-between gap-2 px-3 py-2 ${
                          linkActive(pathname, item.href) ? "bg-brand-red text-white" : "bg-[#FFF7D1]"
                        }`}
                      >
                        <span>{item.label}</span>
                        {badge > 0 ? (
                          <span className="min-w-6 border-2 border-black bg-brand-red px-2 text-center font-bold text-white">
                            {badge}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
