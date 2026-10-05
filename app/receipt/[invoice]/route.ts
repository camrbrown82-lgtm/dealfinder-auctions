import { NextRequest, NextResponse } from "next/server";
import { invoiceFees } from "@/lib/invoiceFees";
import { receiptHtml } from "@/lib/receiptDocument";
import { receiptPageUrl, receiptTokenOk } from "@/lib/receiptToken";
import { mapInvoiceRow } from "@/lib/settlementDb";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: { invoice: string } }) {
  const invoice = decodeURIComponent(context.params.invoice || "").trim();
  const token = request.nextUrl.searchParams.get("token");
  if (!invoice || !receiptTokenOk(invoice, token)) {
    return new NextResponse("This receipt link is not valid.", { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) {
    return new NextResponse("Receipts are unavailable right now.", { status: 503 });
  }

  const { data } = await supabase
    .from("settlement_invoices")
    .select("*")
    .eq("invoice_number", invoice)
    .maybeSingle();
  if (!data) return new NextResponse("Receipt not found.", { status: 404 });

  const record = mapInvoiceRow(data as Record<string, unknown>);
  const fees = invoiceFees({
    hammer: record.lots.reduce((sum, lot) => sum + Number(lot.hammer ?? 0), 0) || Number(record.hammer ?? 0),
    fulfillment: record.fulfillment ?? "unset",
    shippingCost: record.shippingCost ?? 0,
  });
  const download = request.nextUrl.searchParams.get("download") === "1";
  const html = receiptHtml({
    invoice: record.invoice,
    name: record.name,
    email: record.email,
    lots: record.lots,
    fees,
    downloadHref: download ? undefined : receiptPageUrl(record.invoice, true),
  });

  const headers = new Headers({ "Content-Type": "text/html; charset=utf-8" });
  if (download) {
    const file = `DealFinder-receipt-${record.invoice.replace(/[^\w.-]+/g, "")}.html`;
    headers.set("Content-Disposition", `attachment; filename="${file}"`);
  }
  return new NextResponse(html, { status: 200, headers });
}
