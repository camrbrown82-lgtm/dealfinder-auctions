import { settlementSplit } from "@/lib/commission";
import { isHouseConsignor } from "@/lib/consignors";
import { lotWasSold } from "@/lib/settlements";
import type { AuctionLot, PayoutRow } from "@/lib/utils";

export type PayoutItem = {
  lotId: string;
  title: string;
  consignor: string;
  hammer: number;
  commissionRate: number;
  commissionLabel: string;
  house: number;
  payout: number;
};

export function buildPayoutItems(lots: AuctionLot[]): PayoutItem[] {
  return lots
    .filter(lotWasSold)
    .map((lot) => {
      if (isHouseConsignor(lot.consignor)) {
        return {
          lotId: lot.id,
          title: lot.title,
          consignor: lot.consignor,
          hammer: lot.currentBid,
          commissionRate: 0,
          commissionLabel: "House",
          house: lot.currentBid,
          payout: 0,
        };
      }
      const split = settlementSplit(lot.currentBid, lot.consignorPayout);
      if (!split) {
        return {
          lotId: lot.id,
          title: lot.title,
          consignor: lot.consignor,
          hammer: lot.currentBid,
          commissionRate: 0,
          commissionLabel: "Not named in the agreement",
          house: 0,
          payout: lot.currentBid,
        };
      }
      return {
        lotId: lot.id,
        title: lot.title,
        consignor: lot.consignor,
        hammer: lot.currentBid,
        commissionRate: split.rate ?? 0,
        commissionLabel: split.label,
        house: split.house,
        payout: split.consignor,
      };
    });
}

export function buildPayoutReport(lots: AuctionLot[]): PayoutRow[] {
  const byConsignor = new Map<string, PayoutRow>();

  for (const item of buildPayoutItems(lots)) {
    const current = byConsignor.get(item.consignor) ?? {
      consignor: item.consignor,
      lots: 0,
      hammer: 0,
      house: 0,
      payout: 0,
    };
    current.lots += 1;
    current.hammer += item.hammer;
    current.house += item.house;
    current.payout += item.payout;
    byConsignor.set(item.consignor, current);
  }

  return Array.from(byConsignor.values()).sort((a, b) => b.payout - a.payout);
}
