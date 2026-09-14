import { NextRequest, NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import {
  demoSettlementArchives,
  demoSettlementInvoices,
  upsertDemoArchive,
  upsertDemoInvoice,
} from "@/lib/demoSettlementStore";
import { getAdminDemo } from "@/lib/demoAdminStore";
import {
  invoiceRecordFromBuyer,
  type InvoiceMark,
  type SettlementArchiveRecord,
  type SettlementInvoiceRecord,
} from "@/lib/settlementRecords";
import {
  listSettlementArchives,
  listSettlementInvoices,
  upsertSettlementArchive,
  upsertSettlementInvoice,
} from "@/lib/settlementDb";
import type { AuctionSettlement } from "@/lib/settlements";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

function tableMissing(message?: string) {
  return /settlement_invoices|settlement_archives|schema cache/i.test(message ?? "");
}

export async function GET() {
  if (!isAdminSession()) return unauthorized();
  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    try {
      const [invoices, archives] = await Promise.all([
        listSettlementInvoices(supabase),
        listSettlementArchives(supabase),
      ]);
      return NextResponse.json({ invoices, archives, source: "supabase" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load settlements.";
      return NextResponse.json({
        invoices: [],
        archives: [],
        source: "supabase",
        needsMigration: tableMissing(message),
        error: tableMissing(message)
          ? "Settlement tables are not on Supabase yet. Run supabase/migrations/20260913000011_settlements.sql in the SQL editor."
          : message,
      });
    }
  }
  return NextResponse.json({
    invoices: demoSettlementInvoices(),
    archives: demoSettlementArchives(),
    source: "demo",
  });
}

export async function PATCH(request: NextRequest) {
  if (!isAdminSession()) return unauthorized();
  const body = (await request.json()) as Partial<SettlementInvoiceRecord> & InvoiceMark;
  if (!body.invoice) {
    return NextResponse.json({ error: "invoice is required." }, { status: 400 });
  }
  const row: SettlementInvoiceRecord = {
    invoice: body.invoice,
    eventId: body.eventId ?? null,
    buyerKey: body.buyerKey ?? "",
    name: body.name ?? "",
    email: body.email ?? "",
    phone: body.phone ?? "",
    address: body.address ?? "",
    paymentMethod: body.paymentMethod ?? "",
    lots: body.lots ?? [],
    total: Number(body.total ?? 0),
    payment: body.payment ?? "unpaid",
    shipping: body.shipping ?? "pending",
    notes: body.notes ?? "",
    fulfillment: body.fulfillment ?? "unset",
  };
  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    try {
      const existing = await listSettlementInvoices(supabase);
      const current = existing.find((item) => item.invoice === row.invoice);
      if (current && (row.fulfillment === "unset" || !row.fulfillment)) {
        row.fulfillment = current.fulfillment ?? "unset";
      }
      await upsertSettlementInvoice(supabase, row);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save invoice.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } else {
    upsertDemoInvoice(row);
  }
  return NextResponse.json({ ok: true, invoice: row });
}

export async function POST(request: NextRequest) {
  if (!isAdminSession()) return unauthorized();
  const body = (await request.json()) as {
    action?: string;
    sale?: AuctionSettlement;
    archiveInventory?: boolean;
  };
  if (body.action !== "archive" || !body.sale) {
    return NextResponse.json({ error: "sale snapshot is required." }, { status: 400 });
  }
  const sale = body.sale;
  const savedAt = new Date().toISOString();
  const archive: SettlementArchiveRecord = {
    eventId: sale.eventId,
    auctionNumber: sale.auctionNumber,
    name: sale.name,
    savedAt,
    snapshot: sale,
  };
  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    try {
      const existing = await listSettlementInvoices(supabase);
      const byInvoice = new Map(existing.map((row) => [row.invoice, row]));
      for (const buyer of sale.invoices) {
        const current = byInvoice.get(buyer.invoice);
        await upsertSettlementInvoice(
          supabase,
          invoiceRecordFromBuyer(sale.eventId, buyer, {
            payment: current?.payment ?? "unpaid",
            shipping: current?.shipping ?? "pending",
            notes: current?.notes ?? "",
            fulfillment: current?.fulfillment ?? "unset",
          }),
        );
      }
      await upsertSettlementArchive(supabase, archive);
      if (body.archiveInventory !== false) {
        const { error } = await supabase
          .from("auction_events")
          .update({ archived_at: savedAt })
          .eq("id", sale.eventId);
        if (error && !/archived_at/i.test(error.message)) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save auction record.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } else {
    const demo = getAdminDemo();
    for (const buyer of sale.invoices) {
      const existing = demoSettlementInvoices().find((row) => row.invoice === buyer.invoice);
      upsertDemoInvoice(
        invoiceRecordFromBuyer(sale.eventId, buyer, {
          payment: existing?.payment ?? "unpaid",
          shipping: existing?.shipping ?? "pending",
          notes: existing?.notes ?? "",
          fulfillment: existing?.fulfillment ?? "unset",
        }),
      );
    }
    upsertDemoArchive(archive);
    const event = demo.events.find((row) => row.id === sale.eventId);
    if (event && body.archiveInventory !== false) event.archivedAt = savedAt;
  }
  return NextResponse.json({ ok: true, archive });
}
