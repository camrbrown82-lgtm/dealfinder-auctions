import { getAdminDemo, stampAuctionNumbers } from "@/lib/demoAdminStore";
import { listDemoLots } from "@/lib/demoAuctionStore";
import { getDemoUser, listDemoUsers } from "@/lib/demoUsers";
import { mapLot, type LotRow } from "@/lib/mappers";
import { recordSoldLotSettlement } from "@/lib/recordSale";
import { lotWasSold } from "@/lib/settlements";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { AuctionLot } from "@/lib/utils";

export async function closeEndedSoldLots() {
  const now = Date.now();
  let closed = 0;
  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    const nowIso = new Date(now).toISOString();
    const { data: pastEvents } = await supabase
      .from("auction_events")
      .select("id")
      .lt("ends_at", nowIso);
    const pastEventIds = new Set((pastEvents ?? []).map((event) => String(event.id)));
    const { data } = await supabase.from("lots").select("*").in("status", ["live", "paused"]);
    for (const row of data ?? []) {
      if (row.sale_channel === "buy_now") continue;
      const clockPast = row.ends_at ? new Date(String(row.ends_at)).getTime() <= now : false;
      const eventPast = row.event_id ? pastEventIds.has(String(row.event_id)) : false;
      if (!clockPast && !eventPast) continue;
      if (!row.high_bidder && !row.high_bidder_id) {
        await supabase.from("lots").update({ status: "ended" }).eq("id", row.id);
        closed += 1;
        continue;
      }
      const lot = mapLot(row as LotRow);
      await supabase.from("lots").update({ status: "ended" }).eq("id", lot.id);
      lot.status = "ended";
      const buyer = lot.highBidderId
        ? (await supabase.from("profiles").select("*").eq("id", lot.highBidderId).maybeSingle()).data
        : null;
      await recordSoldLotSettlement(
        lot,
        {
          id: lot.highBidderId,
          fullName: buyer ? String(buyer.full_name ?? lot.highBidder) : lot.highBidder,
          email: buyer ? String(buyer.email ?? "") : "",
          phone: buyer ? String(buyer.phone ?? "") : "",
          street: buyer ? String(buyer.street ?? "") : "",
          city: buyer ? String(buyer.city ?? "") : "",
          province: buyer ? String(buyer.province ?? "") : "",
          postalCode: buyer ? String(buyer.postal_code ?? "") : "",
        },
        lot.auctionNumber,
      );
      closed += 1;
    }
    return { closed };
  }

  for (const demo of listDemoLots()) {
    if (demo.status === "ended" || demo.status === "removed") continue;
    const inventory = getAdminDemo().inventory.find((row) => row.id === demo.id);
    const event = inventory?.eventId
      ? getAdminDemo().events.find((row) => row.id === inventory.eventId)
      : null;
    const eventPast = event ? new Date(event.endsAt).getTime() <= now : false;
    const clockPast = new Date(demo.endsAt).getTime() <= now;
    if (!eventPast && !clockPast) continue;
    demo.status = "ended";
    if (inventory) inventory.status = "ended";
    if (!demo.highBidder && !demo.highBidderId) {
      closed += 1;
      continue;
    }
    const user =
      (demo.highBidderId ? getDemoUser(demo.highBidderId) : null) ||
      listDemoUsers().find((row) => row.fullName === demo.highBidder || row.email === demo.highBidder);
    const lot =
      inventory ??
      ({
        id: demo.id,
        title: "Lot",
        currentBid: demo.currentBid,
        minIncrement: demo.minIncrement,
        endsAt: demo.endsAt,
        consignor: "House",
        description: "",
        category: "Oddities",
        image: "",
        highBidder: demo.highBidder,
        highBidderId: demo.highBidderId,
        status: "ended",
        fulfillment: demo.fulfillment,
      } as AuctionLot);
    await recordSoldLotSettlement(lot, user ?? { fullName: demo.highBidder, id: demo.highBidderId });
    closed += 1;
  }
  return { closed };
}

function saleIsClosed(event: { endsAt?: string | null; archivedAt?: string | null }, now: number) {
  if (event.archivedAt) return true;
  const ends = Date.parse(String(event.endsAt ?? ""));
  return Number.isFinite(ends) && ends <= now;
}

/** Unsold lots on a closed sale go back to warehouse inventory so they can be relisted. */
export async function returnUnsoldFromClosedSales() {
  const now = Date.now();
  let returned = 0;
  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    const { data: events } = await supabase.from("auction_events").select("id, ends_at, archived_at");
    const closedIds = (events ?? [])
      .filter((event) =>
        saleIsClosed(
          { endsAt: String(event.ends_at ?? ""), archivedAt: event.archived_at ? String(event.archived_at) : null },
          now,
        ),
      )
      .map((event) => String(event.id));
    if (!closedIds.length) return { returned };

    const { data: lots } = await supabase
      .from("lots")
      .select("id, event_id, status, high_bidder, high_bidder_id, sale_channel")
      .in("event_id", closedIds);

    for (const row of lots ?? []) {
      if (String(row.sale_channel ?? "") === "buy_now") continue;
      const status = String(row.status ?? "");
      if (status === "removed" || status === "draft") continue;
      const sold = Boolean(row.high_bidder || row.high_bidder_id);
      if (sold) {
        if (status !== "ended") {
          await supabase.from("lots").update({ status: "ended" }).eq("id", row.id);
        }
        continue;
      }
      await supabase.from("lots").update({ status: "ended", event_id: null }).eq("id", row.id);
      returned += 1;
    }
    return { returned };
  }

  const demo = getAdminDemo();
  const closedIds = new Set(
    demo.events.filter((event) => saleIsClosed(event, now)).map((event) => event.id),
  );
  for (const lot of demo.inventory) {
    if (lot.saleChannel === "buy_now") continue;
    if (!lot.eventId || !closedIds.has(lot.eventId)) continue;
    if (lot.status === "removed" || lot.status === "draft") continue;
    if (lotWasSold(lot)) {
      lot.status = "ended";
      const clock = listDemoLots().find((row) => row.id === lot.id);
      if (clock) clock.status = "ended";
      continue;
    }
    lot.status = "ended";
    lot.eventId = null;
    const clock = listDemoLots().find((row) => row.id === lot.id);
    if (clock) clock.status = "ended";
    returned += 1;
  }
  stampAuctionNumbers(demo);
  return { returned };
}

export async function settleEndedAuctions() {
  const sold = await closeEndedSoldLots();
  const unsold = await returnUnsoldFromClosedSales();
  return { closed: sold.closed, returned: unsold.returned };
}

