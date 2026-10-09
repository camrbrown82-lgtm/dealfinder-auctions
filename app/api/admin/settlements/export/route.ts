import { NextRequest, NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { getAdminDemo } from "@/lib/demoAdminStore";
import { mapAuctionEvent, type AuctionEventRow } from "@/lib/mapAuctionEvent";
import { mapLot, type LotRow } from "@/lib/mappers";
import { listSettlementInvoices } from "@/lib/settlementDb";
import { settlementDeskSales } from "@/lib/settlements";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { xlsxWorkbook } from "@/lib/xlsxWorkbook";

export const dynamic = "force-dynamic";

function reminder(payment: string, fulfillment: string, shipping: string) {
  const owes = payment === "unpaid" || payment === "partial" || payment === "cash_pending";
  const pickup = fulfillment === "pickup" && shipping !== "picked_up";
  if (owes && pickup) return "Pay and pick up";
  if (owes) return "Pay";
  if (pickup) return "Pick up";
  if (payment === "paid") return "Paid";
  return "";
}

export async function GET(request: NextRequest) {
  if (!isAdminSession()) return unauthorized();
  const eventId = request.nextUrl.searchParams.get("eventId")?.trim();
  if (!eventId) {
    return NextResponse.json({ error: "Choose an auction first." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  let lots = getAdminDemo().inventory;
  let events = getAdminDemo().events;
  let invoices = [] as Awaited<ReturnType<typeof listSettlementInvoices>>;
  if (isSupabaseConfigured && supabase) {
    const [lotsRes, eventsRes] = await Promise.all([
      supabase.from("lots").select("*"),
      supabase.from("auction_events").select("*"),
    ]);
    if (lotsRes.error) return NextResponse.json({ error: lotsRes.error.message }, { status: 400 });
    lots = ((lotsRes.data ?? []) as LotRow[]).map(mapLot).filter((lot) => lot.status !== "draft");
    events = ((eventsRes.data ?? []) as AuctionEventRow[]).map(mapAuctionEvent);
    try {
      invoices = await listSettlementInvoices(supabase);
    } catch {
      invoices = [];
    }
  }

  const sales = settlementDeskSales(events, lots, [], invoices);
  const sale = sales.find((row) => row.eventId === eventId);
  if (!sale) {
    return NextResponse.json({ error: "That auction is not on the settlement desk." }, { status: 404 });
  }

  const savedByInvoice = new Map(invoices.map((row) => [row.invoice, row]));
  const lines = sale.invoices.map((invoice) => {
    const saved = savedByInvoice.get(invoice.invoice);
    const payment = saved?.payment ?? "unpaid";
    const fulfillment = saved?.fulfillment ?? invoice.fulfillment ?? "unset";
    const shipping = saved?.shipping ?? "pending";
    return [
      invoice.invoice,
      invoice.name,
      invoice.email,
      invoice.phone,
      invoice.lots.map((lot) => [lot.lotNumber, lot.title].filter(Boolean).join(" ")).join("; "),
      invoice.hammer,
      invoice.total,
      payment === "paid" && saved?.paymentChannel === "cash" ? "Paid in cash" : payment,
      fulfillment,
      shipping,
      reminder(payment, fulfillment, shipping),
    ];
  });

  const stamp = (sale.auctionNumber || eventId).replace(/[^\w.-]+/g, "-");
  const body = xlsxWorkbook([
    {
      name: "Settlements",
      rows: [
        ["Auction", sale.auctionNumber, sale.name],
        ["Ends", sale.endsAt],
        [],
        [
          "Invoice",
          "Buyer",
          "Email",
          "Phone",
          "Lots",
          "Hammer",
          "Total",
          "Payment",
          "Fulfillment",
          "Pickup / ship",
          "Reminder",
        ],
        ...lines,
      ],
    },
  ]);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="DealFinder-settlements-${stamp}.xlsx"`,
    },
  });
}

