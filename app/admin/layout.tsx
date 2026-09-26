import type { Metadata } from "next";
import { AdminDeskProvider } from "@/components/admin/AdminDesk";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "Admin",
  description: "DealFinder Auctions staff desk.",
  path: "/admin",
  index: false,
});

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminDeskProvider>{children}</AdminDeskProvider>;
}
