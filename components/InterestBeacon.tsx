"use client";

import { useEffect } from "react";
import { recordInterest } from "@/lib/interest";
import type { AuctionLot } from "@/lib/utils";

export function InterestBeacon({ lot }: { lot: Pick<AuctionLot, "id" | "title" | "category" | "consignor"> }) {
  useEffect(() => {
    recordInterest(lot);
  }, [lot.id, lot.title, lot.category, lot.consignor]);
  return null;
}
