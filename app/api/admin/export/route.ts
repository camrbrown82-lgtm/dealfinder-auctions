import { NextRequest, NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import type { CustomerRow } from "@/lib/adminTypes";
import { auctionDeskSheets, filterAuctionDesk, loadAuctionDesk } from "@/lib/auctionDesk";
import { parseSalesView } from "@/lib/salesView";
import { buildAuctionSettlements, itemizeAuctionSettlements } from "@/lib/settlements";
import { mapAuctionEvent } from "@/lib/mapAuctionEvent";
import { getAdminDemo, stampAuctionNumbers } from "@/lib/demoAdminStore";
import { buildPayoutItems, buildPayoutReport } from "@/lib/payouts";
import { spreadsheetXml } from "@/lib/spreadsheet";
import { xlsxWorkbook } from "@/lib/xlsxWorkbook";
import { listSettlementArchives, listSettlementInvoices } from "@/lib/settlementDb";
import { demoSettlementArchives, demoSettlementInvoices } from "@/lib/demoSettlementStore";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { mapConsignment, mapLot, type ConsignmentRow, type LotRow } from "@/lib/mappers";
import { listingGradeOf } from "@/lib/listingGrade";
import type { AuctionEvent, AuctionLot, Consignment } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAdminSession()) return unauthorized();

  const eventId = request.nextUrl.searchParams.get("eventId");
  const salesView = parseSalesView(request.nextUrl.searchParams.get("view"));
  if (eventId) {
    const desk = filterAuctionDesk(await loadAuctionDesk(eventId), request.nextUrl.searchParams.get("q") ?? "");
    const stamp = (desk.event?.auctionNumber || eventId).replace(/[^\w.-]+/g, "-");
    const body = xlsxWorkbook(auctionDeskSheets(desk, salesView));
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="DealFinder-${stamp}.xlsx"`,
      },
    });
  }

  let inventory: AuctionLot[] = [];
  let events: AuctionEvent[] = [];
  let queue: Consignment[] = [];
  let customers: CustomerRow[] = [];
  let invoices = demoSettlementInvoices();
  let archives = demoSettlementArchives();

  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    const [consignments, lots, eventRows, profiles] = await Promise.all([
      supabase.from("consignments").select("*"),
      supabase.from("lots").select("*"),
      supabase.from("auction_events").select("*"),
      supabase.from("profiles").select("*"),
    ]);
    queue = ((consignments.data ?? []) as ConsignmentRow[]).map(mapConsignment);
    inventory = ((lots.data ?? []) as LotRow[])
      .map(mapLot)
      .filter((lot) => lot.status !== "draft");
    events = (eventRows.data ?? []).map((row) => mapAuctionEvent(row as Parameters<typeof mapAuctionEvent>[0]));
    const eventNumbers = new Map(events.map((event) => [event.id, event.auctionNumber ?? null]));
    for (const lot of inventory) {
      if (lot.eventId) lot.auctionNumber = eventNumbers.get(lot.eventId) ?? lot.auctionNumber;
    }
    const { data: soldLots } = await supabase.from("lots").select("high_bidder_id, current_bid, status");
    customers = ((profiles.data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const wins = (soldLots ?? []).filter(
        (lot) => lot.high_bidder_id === row.id && lot.status === "ended",
      );
      const spend = wins.reduce((sum, lot) => sum + Number(lot.current_bid ?? 0), 0);
      return {
        id: String(row.id),
        email: String(row.email ?? ""),
        fullName: String(row.full_name ?? ""),
        status: row.status === "suspended" ? "suspended" : "active",
        phone: String(row.phone ?? ""),
        street: String(row.street ?? ""),
        city: String(row.city ?? ""),
        province: String(row.province ?? ""),
        postalCode: String(row.postal_code ?? ""),
        paymentMethod: String(row.payment_method ?? ""),
        auctionsWon: wins.length,
        lifetimeSpend: spend,
        paymentFlag: spend > 0 ? "has_invoices" : "none",
      };
    });
    try {
      invoices = await listSettlementInvoices(supabase);
      archives = await listSettlementArchives(supabase);
    } catch {
      invoices = [];
      archives = [];
    }
  } else {
    const demo = getAdminDemo();
    stampAuctionNumbers(demo);
    inventory = demo.inventory.filter((lot) => lot.status !== "draft");
    events = demo.events;
    queue = demo.queue;
  }

  const sales = buildAuctionSettlements(events, inventory, customers);
  const invoiceSales = salesView === "itemized" ? itemizeAuctionSettlements(sales) : sales;
  const payouts = buildPayoutReport(inventory);
  const payoutItems = buildPayoutItems(inventory);
  const marks = new Map(invoices.map((row) => [row.invoice, row]));

  const xml = spreadsheetXml([
    {
      name: "Auctions",
      rows: [
        ["Auction #", "Name", "Starts", "Ends", "Archived", "Lots", "Sold invoices", "Hammer"],
        ...events.map((event) => {
          const sale = sales.find((row) => row.eventId === event.id);
          const lots = inventory.filter((lot) => lot.eventId === event.id);
          return [
            event.auctionNumber ?? "",
            event.name,
            event.startsAt,
            event.endsAt,
            event.archivedAt ?? "",
            lots.length,
            sale?.invoices.length ?? 0,
            sale?.invoices.reduce((sum, row) => sum + row.total, 0) ?? 0,
          ];
        }),
      ],
    },
    {
      name: "Inventory",
      rows: [
        ["Lot #", "Title", "Status", "Auction #", "Consignor", "Condition", "Current bid", "Buy now", "High bidder", "Ends"],
        ...inventory.map((lot) => [
          lot.lotNumber ?? "",
          lot.title,
          lot.status ?? "",
          lot.auctionNumber ?? "",
          lot.consignor,
          listingGradeOf(lot),
          lot.currentBid,
          lot.buyNowPrice ?? lot.reservePrice ?? "",
          lot.highBidder ?? "",
          lot.endsAt,
        ]),
      ],
    },
    {
      name: "Settlements",
      rows: [
        [
          "Invoice",
          "Auction #",
          "Buyer",
          "Email",
          "Phone",
          "Address",
          "Payment method",
          "Payment status",
          "Shipping",
          "Notes",
          "Lots",
          "Total",
        ],
        ...invoiceSales.flatMap((sale) =>
          sale.invoices.map((buyer) => {
            const mark = marks.get(buyer.invoice);
            return [
              buyer.invoice,
              sale.auctionNumber,
              buyer.name,
              buyer.email,
              buyer.phone,
              buyer.address,
              buyer.paymentMethod,
              mark?.payment ?? "unpaid",
              mark?.shipping ?? "pending",
              mark?.notes ?? "",
              buyer.lots.map((lot) => `${lot.lotNumber ?? lot.id} ${lot.title}`).join("; "),
              buyer.total,
            ];
          }),
        ),
      ],
    },
    {
      name: "Invoice lines",
      rows: [
        ["Invoice", "Auction #", "Buyer", "Lot #", "Item", "Hammer"],
        ...sales.flatMap((sale) =>
          sale.invoices.flatMap((buyer) =>
            buyer.lots.map((lot) => [
              buyer.invoice,
              sale.auctionNumber,
              buyer.name,
              lot.lotNumber ?? "",
              lot.title,
              lot.hammer,
            ]),
          ),
        ),
      ],
    },
    {
      name: "Payouts",
      rows: [
        ["Consignor", "Lots", "Hammer", "House", "Payout", "Item", "Commission %"],
        ...payoutItems.map((row) => [
          row.consignor,
          "",
          row.hammer,
          row.house,
          row.payout,
          row.title,
          Math.round(row.commissionRate * 100),
        ]),
        ...payouts.map((row) => [row.consignor, row.lots, row.hammer, row.house, row.payout, "TOTAL", ""]),
      ],
    },
    {
      name: "Customers",
      rows: [
        ["Name", "Email", "Phone", "Status", "Street", "City", "Province", "Postal", "Payment", "Wins", "Spend"],
        ...customers.map((row) => [
          row.fullName,
          row.email,
          row.phone,
          row.status,
          row.street ?? "",
          row.city ?? "",
          row.province ?? "",
          row.postalCode ?? "",
          row.paymentMethod,
          row.auctionsWon,
          row.lifetimeSpend,
        ]),
      ],
    },
    {
      name: "Review queue",
      rows: [
        ["Status", "Consignor", "Title", "Condition", "Buy now"],
        ...queue.map((item) => [
          item.status,
          item.consignor,
          item.title,
          item.listingGrade ?? item.condition ?? "",
          item.buyNowPrice ?? item.reservePrice ?? 0,
        ]),
      ],
    },
    {
      name: "Saved records",
      rows: [
        ["Saved at", "Auction #", "Name", "Invoices", "Hammer"],
        ...archives.map((row) => [
          row.savedAt,
          row.auctionNumber,
          row.name,
          row.snapshot.invoices.length,
          row.snapshot.invoices.reduce((sum, invoice) => sum + invoice.total, 0),
        ]),
      ],
    },
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="DealFinder-house-${stamp}.xls"`,
    },
  });
}
