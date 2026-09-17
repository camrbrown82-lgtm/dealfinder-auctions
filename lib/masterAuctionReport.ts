import { invoiceFees, money } from "@/lib/invoiceFees";
import { buildPayoutItems, type PayoutItem } from "@/lib/payouts";
import { lotWasSold } from "@/lib/settlements";
import type { AuctionDeskPayload } from "@/lib/auctionDesk";
import type { SettlementInvoiceRecord } from "@/lib/settlementRecords";
import type { SpreadsheetSheet } from "@/lib/spreadsheet";

export function masterAuctionSheets(
  desk: AuctionDeskPayload,
  invoices: SettlementInvoiceRecord[] = [],
): SpreadsheetSheet[] {
  const event = desk.event;
  const lots = desk.lots;
  const persisted = new Map(invoices.map((row) => [row.invoice, row]));
  const payouts = buildPayoutItems(lots.filter(lotWasSold));

  const invoicesByNumber = new Map<string, { hammer: number; ship: boolean; shippingCost: number }>();
  for (const sale of desk.sales) {
    const current = invoicesByNumber.get(sale.invoice) ?? { hammer: 0, ship: false, shippingCost: 0 };
    current.hammer += sale.hammer;
    const mark = persisted.get(sale.invoice);
    const lot = lots.find((item) => item.id === sale.lotId);
    if (mark?.fulfillment === "ship" || lot?.fulfillment === "ship") current.ship = true;
    current.shippingCost = money(mark?.shippingCost ?? lot?.shippingCost ?? current.shippingCost);
    invoicesByNumber.set(sale.invoice, current);
  }

  const collected = Array.from(invoicesByNumber.values()).map((row) =>
    invoiceFees({
      hammer: row.hammer,
      fulfillment: row.ship ? "ship" : "pickup",
      shippingCost: row.shippingCost,
    }),
  );
  const grossHammer = money(collected.reduce((sum, row) => sum + row.hammer, 0));
  const premium = money(collected.reduce((sum, row) => sum + row.premium, 0));
  const gst = money(collected.reduce((sum, row) => sum + row.gst, 0));
  const handling = money(collected.reduce((sum, row) => sum + row.handling, 0));
  const shipping = money(collected.reduce((sum, row) => sum + row.shipping, 0));
  const houseTake = money(payouts.reduce((sum, row) => sum + row.house, 0));
  const netRevenue = money(premium + handling + houseTake);

  return [
    {
      name: "Item Lot Master",
      rows: [
        ["Lot #", "Title", "Reserve Price", "Winning Bid", "Status", "Buyer ID", "Buyer Name"],
        ...lots.map((lot) => {
          const sold = lotWasSold(lot);
          return [
            lot.lotNumber ?? "",
            lot.title,
            lot.reservePrice ?? lot.buyNowPrice ?? "",
            sold ? lot.currentBid : "",
            sold ? "Sold" : "Unsold",
            lot.highBidderId ?? "",
            lot.highBidder ?? "",
          ];
        }),
      ],
    },
    {
      name: "Consignor Breakdown",
      rows: [
        ["Item", "Lot #", "Sale Price", "House Fee", "Net Payout", "Consignor"],
        ...payouts.map((row: PayoutItem) => {
          const lot = lots.find((item) => item.id === row.lotId);
          return [row.title, lot?.lotNumber ?? "", row.hammer, row.house, row.payout, row.consignor];
        }),
      ],
    },
    {
      name: "Financial Summary",
      rows: [
        ["Metric", "Amount"],
        ["Auction #", event?.auctionNumber ?? ""],
        ["Auction name", event?.name ?? ""],
        ["Total Gross Hammer Price", grossHammer],
        ["15% Buyer's Premium collected", premium],
        ["5% GST collected", gst],
        ["Shipping Handling Fees collected", handling],
        ["Carrier shipping (pass-through)", shipping],
        ["Consignor house commission", houseTake],
        ["Net Revenue (premium + handling + house commission)", netRevenue],
      ],
    },
  ];
}
