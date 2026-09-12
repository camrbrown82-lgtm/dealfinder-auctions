"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Desk" },
  { href: "/admin/intake", label: "AI generator" },
] as const;

export function AdminSubnav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-2">
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link key={link.href} href={link.href} className={active ? "comic-btn" : "comic-btn-invert"}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
