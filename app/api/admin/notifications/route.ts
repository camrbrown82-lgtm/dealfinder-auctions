import { NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { listPendingCashAuthRequests } from "@/lib/auctionRegistrations";
import { getAdminDemo } from "@/lib/demoAdminStore";
import { demoSettlementInvoices } from "@/lib/demoSettlementStore";
import { mapConsignment, type ConsignmentRow } from "@/lib/mappers";
import { listSettlementInvoices } from "@/lib/settlementDb";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { Consignment } from "@/lib/utils";

export const dynamic = "force-dynamic";

export type DeskNotification = {
  id: string;
  kind: "consignment" | "cash_invoice" | "cash_bid";
  title: string;
  who: string;
  detail: string;
  amount: number;
  at: string | null;
  href: string;
  invoice?: string;
  userId?: string;
  eventId?: string;
};

function waitingConsignments(
  rows: Consignment[],
  submittedAt?: Map<string, string>,
): DeskNotification[] {
  return rows
    .filter((row) => row.status === "pending" || row.status === "held")
    .map((row) => ({
      id: `consignment:${row.id}`,
      kind: "consignment" as const,
      title: row.title,
      who: row.consignor ?? "Consignor",
      detail: row.status === "held" ? "On hold — needs a decision" : "Waiting for approval",
      amount: Number(row.startingBid ?? 0),
      at: submittedAt?.get(row.id) ?? null,
      href: "/admin/consignments",
    }));
}

export async function GET() {
  if (!isAdminSession()) return unauthorized();

  const supabase = getSupabaseAdmin();
  const notifications: DeskNotification[] = [];

  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase
      .from("consignments")
      .select("*")
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as Array<ConsignmentRow & { created_at?: string | null }>;
    const submittedAt = new Map(
      rows.filter((row) => row.created_at).map((row) => [String(row.id), String(row.created_at)]),
    );
    notifications.push(...waitingConsignments(rows.map((row) => mapConsignment(row)), submittedAt));
    const invoices = await listSettlementInvoices(supabase);
    for (const row of invoices.filter((item) => item.payment === "cash_pending")) {
      notifications.push({
        id: `cash:${row.invoice}`,
        kind: "cash_invoice",
        title: row.lots.map((lot) => lot.title).filter(Boolean).join(", ") || row.invoice,
        who: row.name || row.email,
        detail: `Cash on pickup · invoice ${row.invoice}`,
        amount: Number(row.total ?? 0),
        at: null,
        href: "/admin/settlements",
        invoice: row.invoice,
      });
    }
  } else {
    notifications.push(...waitingConsignments(getAdminDemo().queue));
    for (const row of demoSettlementInvoices().filter((item) => item.payment === "cash_pending")) {
      notifications.push({
        id: `cash:${row.invoice}`,
        kind: "cash_invoice",
        title: row.lots.map((lot) => lot.title).filter(Boolean).join(", ") || row.invoice,
        who: row.name || row.email,
        detail: `Cash on pickup · invoice ${row.invoice}`,
        amount: Number(row.total ?? 0),
        at: null,
        href: "/admin/settlements",
        invoice: row.invoice,
      });
    }
  }

  for (const row of await listPendingCashAuthRequests()) {
    notifications.push({
      id: `cashbid:${row.userId}:${row.eventId}`,
      kind: "cash_bid",
      title: row.auctionLabel,
      who: row.fullName || row.email || "Bidder",
      detail: "Wants to bid with cash on pickup",
      amount: 0,
      at: row.requestedAt || null,
      href: "/admin/notifications",
      userId: row.userId,
      eventId: row.eventId,
    });
  }

  const counts = {
    consignments: notifications.filter((row) => row.kind === "consignment").length,
    cash: notifications.filter((row) => row.kind !== "consignment").length,
    total: notifications.length,
  };

  return NextResponse.json({ notifications, counts });
}
