"use client";

import { AdminDeskProvider } from "@/components/admin/AdminDesk";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminDeskProvider>{children}</AdminDeskProvider>;
}
