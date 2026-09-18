import { parseLotSeq } from "@/lib/catalogNumbers";
import { invoiceFees, money } from "@/lib/invoiceFees";
import { fulfillmentLabel } from "@/lib/payments";
import { buildPayoutItems } from "@/lib/payouts";
import { lotIsUnsoldOrNoBid, lotWasSold } from "@/lib/settlements";
import type { AuctionDeskPayload } from "@/lib/auctionDesk";
import type { SpreadsheetSheet } from "@/lib/spreadsheet";

function sortByLotNumber<T>(rows: T[], lotNumber: (row: T) => string) {
  return [...rows].sort((a, b) => {
    const left = parseLotSeq(lotNumber(a)) ?? Number.MAX_SAFE_INTEGER;
    const right = parseLotSeq(lotNumber(b)) ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return lotNumber(a).localeCompare(lotNumber(b), undefined, { numeric: true });
  });
}

export function masterAuctionSheets(desk: AuctionDeskPayload): SpreadsheetSheet[] {
  const event = desk.event;
  const lots = desk.lots;
  const sold = sortByLotNumber(lots.filter(lotWasSold), (lot) => lot.lotNumber ?? "");
  const unsold = sortByLotNumber(lots.filter(lotIsUnsoldOrNoBid), (lot) => lot.lotNumber ?? "");
  const salesByLot = new Map(desk.sales.map((row) => [row.lotId, row]));
  const payouts = sortByLotNumber(buildPayoutItems(sold), (row) => {
    const lot = lots.find((item) => item.id === row.lotId);
    return lot?.lotNumber ?? "";
  }).sort((a, b) => {
    const name = a.consignor.localeCompare(b.consignor);
    if (name !== 0) return name;
    const lotA = lots.find((item) => item.id === a.lotId)?.lotNumber ?? "";
    const lotB = lots.find((item) => item.id === b.lotId)?.lotNumber ?? "";
    return (parseLotSeq(lotA) ?? 0) - (parseLotSeq(lotB) ?? 0);
  });

  const soldLines = sold.map((lot) => {
    const sale = salesByLot.get(lot.id);
    const fees = invoiceFees({
      hammer: lot.currentBid,
      fulfillment: lot.fulfillment,
      shippingCost: lot.shippingCost,
    });
    const contact = [sale?.buyerEmail, sale?.buyerPhone].filter(Boolean).join(" · ");
    return {
      lot,
      sale,
      fees,
      buyerName: sale?.buyerName || lot.highBidder || "",
      contact,
      fulfillment:
        lot.fulfillment === "ship" ? "Shipped" : lot.fulfillment === "pickup" ? "Pickup" : fulfillmentLabel(lot.fulfillment ?? "unset"),
    };
  });

  const feeRows = soldLines.map((row) => row.fees);
  const grossHammer = money(feeRows.reduce((sum, row) => sum + row.hammer, 0));
  const premium = money(feeRows.reduce((sum, row) => sum + row.premium, 0));
  const gst = money(feeRows.reduce((sum, row) => sum + row.gst, 0));
  const handling = money(feeRows.reduce((sum, row) => sum + row.handling, 0));
  const houseTake = money(payouts.reduce((sum, row) => sum + row.house, 0));
  const netRevenue = money(premium + handling + houseTake);
  const buyers = new Set(
    sold.map((lot) => lot.highBidderId || lot.highBidder || "").filter(Boolean),
  );

  return [
    {
      name: "Auction Summary",
      rows: [
        ["Metric", "Value"],
        ["Auction #", event?.auctionNumber ?? ""],
        ["Auction name", event?.name ?? ""],
        ["Status", event?.archivedAt ? "Closed" : "Ended"],
        ["Total lots", lots.length],
        ["Sold lots", sold.length],
        ["Unsold / no-bid lots", unsold.length],
        ["Unique buyers", buyers.size],
        ["Total Gross Hammer Price", grossHammer],
        ["Total 15% House Premium Collected", premium],
        ["Total $10 Shipping Handling Fees", handling],
        ["Total GST", gst],
        ["Total Net Revenue", netRevenue],
      ],
    },
    {
      name: "Sold Lots & Winning Bids",
      rows: [
        [
          "Lot Number",
          "Item Name",
          "Hammer Price",
          "15% Buyer's Premium",
          "GST",
          "Shipping/Handling",
          "Final Invoice Total",
          "Buyer Name",
          "Buyer Contact",
          "Fulfillment Method",
        ],
        ...soldLines.map((row) => [
          row.lot.lotNumber ?? "",
          row.lot.title,
          row.fees.hammer,
          row.fees.premium,
          row.fees.gst,
          money(row.fees.handling + row.fees.shipping),
          row.fees.total,
          row.buyerName,
          row.contact,
          row.fulfillment,
        ]),
      ],
    },
    {
      name: "Unsold No-Bid Lots",
      rows: [
        ["Lot Number", "Item Name", "Consignor Name", "Reserve Price"],
        ...unsold.map((lot) => [
          lot.lotNumber ?? "",
          lot.title,
          lot.consignor,
          lot.reservePrice ?? "",
        ]),
      ],
    },
    {
      name: "Consignor Breakdown",
      rows: [
        [
          "Consignor Name/ID",
          "Lot Number",
          "Item Name",
          "Hammer Price",
          "House Commission Deducted",
          "Net Consignor Payout",
        ],
        ...payouts.map((row) => {
          const lot = lots.find((item) => item.id === row.lotId);
          const label = lot?.consignmentId ? `${row.consignor} (${lot.consignmentId})` : row.consignor;
          return [label, lot?.lotNumber ?? "", row.title, row.hammer, row.house, row.payout];
        }),
      ],
    },
  ];
}
