import { agreementCommission } from "@/lib/commission";
import { isHouseConsignor } from "@/lib/consignors";
import {
  type ConsignorItem,
  type PipelineStatus,
} from "@/lib/utils";

export function money(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function lotWasSoldRow(lot: {
  status?: string | null;
  buy_now_status?: string | null;
  paid_at?: string | null;
  high_bidder?: string | null;
  high_bidder_id?: string | null;
}) {
  if (lot.paid_at || lot.buy_now_status === "sold") return true;
  if (lot.status === "ended" || lot.status === "removed") {
    return Boolean(lot.high_bidder || lot.high_bidder_id);
  }
  return false;
}

export function consignorShare(consignor: string, hammer: number) {
  if (isHouseConsignor(consignor) || !(hammer > 0)) {
    return { label: "—", houseCut: 0, payout: 0, rate: 0 };
  }
  const split = agreementCommission(hammer);
  if (!split) return { label: "—", houseCut: 0, payout: 0, rate: 0 };
  return {
    label: split.label,
    houseCut: split.house,
    payout: split.consignor,
    rate: split.rate ?? 0,
  };
}

export function pipelineFromLot(lot: {
  status?: string | null;
  buy_now_status?: string | null;
  paid_at?: string | null;
  payout_sent_at?: string | null;
  high_bidder?: string | null;
  high_bidder_id?: string | null;
}): PipelineStatus {
  if (lot.payout_sent_at) return "paid_out";
  if (lotWasSoldRow(lot)) return "sold";
  if (lot.status === "live") return "live";
  if (lot.status === "paused" || lot.status === "draft") return "scheduled";
  return "scheduled";
}

export function withLotMoney(
  item: ConsignorItem,
  lot?: {
    id?: string | null;
    current_bid?: number | string | null;
    paid_at?: string | null;
    payout_sent_at?: string | null;
    payout_amount?: number | string | null;
    payout_method?: string | null;
    consignor_cleared_at?: string | null;
    lot_number?: string | null;
    slug?: string | null;
  } | null,
  clearedAt?: string | null,
): ConsignorItem {
  const hammer = lot && (item.pipelineStatus === "sold" || item.pipelineStatus === "paid_out")
    ? money(lot.current_bid)
    : null;
  const share = consignorShare(item.consignor, hammer ?? 0);
  return {
    ...item,
    lotId: lot?.id ? String(lot.id) : item.lotId ?? null,
    lotNumber: lot?.lot_number ? String(lot.lot_number) : item.lotNumber ?? null,
    lotHref: lot ? `/auctions/${encodeURIComponent(String(lot.slug || lot.id))}` : item.lotHref ?? null,
    hammer,
    houseCut: hammer == null ? 0 : share.houseCut,
    payout: lot?.payout_sent_at && money(lot.payout_amount) > 0 ? money(lot.payout_amount) : hammer == null ? 0 : share.payout,
    commissionLabel: hammer == null ? "—" : share.label,
    commissionRate: share.rate || item.commissionRate,
    buyerPaidAt: lot?.paid_at ?? null,
    payoutSentAt: lot?.payout_sent_at ?? null,
    payoutMethod: lot?.payout_method || null,
    clearedAt: clearedAt ?? lot?.consignor_cleared_at ?? null,
  };
}

export function isActiveAccepted(item: ConsignorItem) {
  return item.pipelineStatus === "scheduled" || item.pipelineStatus === "live";
}

export function isPayoutRow(item: ConsignorItem) {
  return (item.pipelineStatus === "sold" || item.pipelineStatus === "paid_out") && !item.clearedAt;
}

export function canClearItem(item: ConsignorItem) {
  if (item.clearedAt) return false;
  if (item.pipelineStatus === "rejected") return true;
  return item.pipelineStatus === "paid_out";
}

export function payoutSheetRows(items: ConsignorItem[]) {
  return [
    [
      "Lot #",
      "Title",
      "Status",
      "Hammer",
      "House commission",
      "Your payout",
      "Buyer paid",
      "Payout sent",
      "Payout method",
    ],
    ...items.map((item) => [
      item.lotNumber ?? "",
      item.title,
      item.pipelineStatus === "paid_out" ? "Paid out" : item.pipelineStatus === "sold" ? "Payout pending" : item.pipelineStatus,
      item.hammer ?? "",
      item.houseCut ?? 0,
      item.payout ?? 0,
      item.buyerPaidAt ? "Yes" : "No",
      item.payoutSentAt ? "Yes" : "No",
      item.payoutMethod ?? "",
    ]),
  ];
}
