import { NextRequest, NextResponse } from "next/server";
import { parseListingGrade, withListedGrade } from "@/lib/listingGrade";
import { addDemoConsignment } from "@/lib/demoAdminStore";
import { openingBid } from "@/lib/buyNow";
import { agreementCommission } from "@/lib/commission";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { persistPublicImageUrls } from "@/lib/consignmentStorage";
import { getBidderSession } from "@/lib/bidderAuth";
import type { SaleChannel } from "@/lib/saleChannel";
import { sendAdminConsignmentAlertEmail, sendConsignmentReceivedEmail } from "@/lib/notify";
import { pipelineFromLot, withLotMoney } from "@/lib/consignorPortal";
import {
  DEFAULT_COMMISSION_RATE,
  MOCK_CONSIGNMENTS,
  MOCK_LOTS,
  type ConsignorItem,
  type LotCategory,
  consignmentToPipeline,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

function demoItems(): ConsignorItem[] {
  const fromQueue: ConsignorItem[] = MOCK_CONSIGNMENTS.map((item) => ({
    id: item.id,
    title: item.title,
    consignor: item.consignor,
    pipelineStatus: consignmentToPipeline(item.status),
    startingBid: 50,
    buyNowPrice: 80,
    commissionRate: DEFAULT_COMMISSION_RATE,
    saleChannel: item.saleChannel ?? "auction",
  }));

  const fromLots: ConsignorItem[] = MOCK_LOTS.map((lot) => ({
    id: lot.id,
    title: lot.title,
    consignor: lot.consignor,
    pipelineStatus: lot.status === "ended" ? "sold" : "live",
    startingBid: lot.currentBid,
    buyNowPrice: lot.buyNowPrice ?? lot.reservePrice ?? lot.currentBid,
    commissionRate: DEFAULT_COMMISSION_RATE,
  }));

  return [...fromQueue, ...fromLots];
}

function titleKey(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const PIPELINE_RANK: Record<ConsignorItem["pipelineStatus"], number> = {
  paid_out: 5,
  sold: 4,
  live: 3,
  scheduled: 2,
  buy_now_pending: 1,
  pending_approval: 1,
  rejected: 0,
};

/** One row per item. A filed lot wins over a second pending copy of the same title. */
function preferFiledItems(items: ConsignorItem[]) {
  const ranked = [...items].sort(
    (a, b) => PIPELINE_RANK[b.pipelineStatus] - PIPELINE_RANK[a.pipelineStatus],
  );
  const seen = new Set<string>();
  const kept: ConsignorItem[] = [];
  for (const item of ranked) {
    const key = titleKey(item.title);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    kept.push(item);
  }
  return kept;
}

function ownsRow(
  session: { id: string; email: string; fullName: string },
  row: { owner_id?: string | null; contact_email?: string | null; consignor_name?: string | null },
) {
  if (row.owner_id && row.owner_id === session.id) return true;
  const email = String(row.contact_email ?? "").trim().toLowerCase();
  if (email && email === session.email.trim().toLowerCase()) return true;
  const name = String(row.consignor_name ?? "").trim().toLowerCase();
  const mine = session.fullName.trim().toLowerCase();
  return Boolean(mine && name === mine);
}

export async function GET() {
  const session = await getBidderSession();
  if (!session) {
    return NextResponse.json({ error: "Log in to view your consignments." }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();

  if (!isSupabaseConfigured || !supabase) {
    const mine = session.fullName.trim().toLowerCase();
    const items = demoItems().filter((item) => item.consignor.toLowerCase() === mine);
    return NextResponse.json({ source: "demo", items });
  }

  const [queueRes, lotsRes] = await Promise.all([
    supabase.from("consignments").select("*").order("created_at", { ascending: false }),
    supabase.from("lots").select("*").order("created_at", { ascending: false }),
  ]);

  if (queueRes.error || lotsRes.error) {
    return NextResponse.json(
      { error: queueRes.error?.message || lotsRes.error?.message },
      { status: 500 },
    );
  }

  const lotByConsignment = new Map(
    (lotsRes.data ?? []).map((lot) => [lot.consignment_id as string | null, lot]),
  );

  const ownQueue = (queueRes.data ?? []).filter((row) =>
    ownsRow(session, {
      owner_id: row.owner_id as string | null,
      contact_email: row.contact_email as string | null,
      consignor_name: row.consignor_name as string | null,
    }),
  );
  const ownIds = new Set(ownQueue.map((row) => row.id as string));

  const items: ConsignorItem[] = ownQueue.map((row) => {
    const lot = lotByConsignment.get(row.id);
    const saleChannel = row.sale_channel === "buy_now" ? "buy_now" : "auction";
    let pipelineStatus: ConsignorItem["pipelineStatus"] =
      row.status === "rejected" ? "rejected" : consignmentToPipeline(row.status);
    if (saleChannel === "buy_now" && (row.status === "pending" || row.status === "held")) {
      pipelineStatus = "buy_now_pending";
    }
    if (row.status === "approved" && !lot) {
      pipelineStatus = "scheduled";
    }
    if (lot) pipelineStatus = pipelineFromLot(lot);
    const clearedAt = String(row.consignor_cleared_at ?? lot?.consignor_cleared_at ?? "") || null;

    return withLotMoney(
      {
        id: String(row.id),
        title: String(row.title ?? "Item"),
        consignor: String(row.consignor_name ?? ""),
        pipelineStatus,
        startingBid: Number(row.starting_bid ?? lot?.starting_bid ?? 0),
        buyNowPrice: Number(row.buy_now_price ?? row.reserve_price ?? 0),
        commissionRate: Number(row.commission_rate ?? DEFAULT_COMMISSION_RATE),
        saleChannel,
        charity: row.is_charity === true,
      },
      lot,
      clearedAt,
    );
  });

  const seen = new Set(items.map((item) => item.id));
  for (const lot of lotsRes.data ?? []) {
    const cid = lot.consignment_id as string | null;
    if (cid && !ownIds.has(cid)) continue;
    if (!cid && !ownsRow(session, { consignor_name: lot.consignor_name as string | null })) continue;
    if (cid && seen.has(cid)) continue;
    if (seen.has(lot.id as string)) continue;
    seen.add(String(lot.id));
    items.push(
      withLotMoney(
        {
          id: String(lot.id),
          title: String(lot.title ?? "Lot"),
          consignor: String(lot.consignor_name ?? ""),
          pipelineStatus: pipelineFromLot(lot),
          startingBid: Number(lot.starting_bid ?? lot.current_bid ?? 0),
          buyNowPrice: Number(lot.buy_now_price ?? lot.reserve_price ?? 0),
          commissionRate: DEFAULT_COMMISSION_RATE,
        },
        lot,
        lot.consignor_cleared_at ? String(lot.consignor_cleared_at) : null,
      ),
    );
  }

  return NextResponse.json({ source: "supabase", items: preferFiledItems(items) });
}

export async function PATCH(request: NextRequest) {
  const session = await getBidderSession();
  if (!session) {
    return NextResponse.json({ error: "Log in to update your consignments." }, { status: 401 });
  }
  const body = (await request.json()) as { action?: string; ids?: string[] };
  if (body.action !== "clear") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  const ids = Array.from(new Set((body.ids ?? []).map((id) => String(id || "").trim()).filter(Boolean)));
  if (ids.length === 0) {
    return NextResponse.json({ error: "Pick at least one finished item to clear." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) {
    return NextResponse.json({ ok: true, cleared: ids.length, source: "demo" });
  }

  const [queueRes, lotsById, lotsByCid] = await Promise.all([
    supabase.from("consignments").select("*").in("id", ids),
    supabase.from("lots").select("*").in("id", ids),
    supabase.from("lots").select("*").in("consignment_id", ids),
  ]);
  if (queueRes.error || lotsById.error || lotsByCid.error) {
    return NextResponse.json(
      { error: queueRes.error?.message || lotsById.error?.message || lotsByCid.error?.message },
      { status: 500 },
    );
  }
  const lotRows = [...(lotsById.data ?? []), ...(lotsByCid.data ?? [])];

  const ownedConsignments = (queueRes.data ?? []).filter((row) =>
    ownsRow(session, {
      owner_id: row.owner_id as string | null,
      contact_email: row.contact_email as string | null,
      consignor_name: row.consignor_name as string | null,
    }),
  );
  const ownedLots = lotRows.filter((row) =>
    ownsRow(session, { consignor_name: row.consignor_name as string | null }),
  );
  const now = new Date().toISOString();
  const cleared: string[] = [];

  for (const row of ownedConsignments) {
    const lot = lotRows.find((item) => item.consignment_id === row.id);
    const status = lot ? pipelineFromLot(lot) : row.status === "rejected" ? "rejected" : "scheduled";
    if (status !== "paid_out" && status !== "rejected") continue;
    const { error } = await supabase.from("consignments").update({ consignor_cleared_at: now }).eq("id", row.id);
    if (error) {
      return NextResponse.json(
        { error: "Could not clear finished items. Apply the payout tracking migration, then try again." },
        { status: 400 },
      );
    }
    if (lot?.id) {
      await supabase.from("lots").update({ consignor_cleared_at: now }).eq("id", lot.id);
    }
    cleared.push(String(row.id));
  }

  for (const lot of ownedLots) {
    if (cleared.includes(String(lot.id))) continue;
    if (pipelineFromLot(lot) !== "paid_out") continue;
    const { error } = await supabase.from("lots").update({ consignor_cleared_at: now }).eq("id", lot.id);
    if (error) {
      return NextResponse.json(
        { error: "Could not clear finished items. Apply the payout tracking migration, then try again." },
        { status: 400 },
      );
    }
    cleared.push(String(lot.id));
  }

  return NextResponse.json({ ok: true, cleared: cleared.length });
}

export async function POST(request: NextRequest) {
  const session = await getBidderSession();
  if (!session) {
    return NextResponse.json({ error: "Log in to consign an item." }, { status: 401 });
  }

  const body = (await request.json()) as {
    consignorName?: string;
    title?: string;
    description?: string;
    category?: LotCategory;
    startingBid?: number;
    buyNowPrice?: number;
    reservePrice?: number;
    estimatedMarketValue?: number;
    imageUrls?: string[];
    termsAccepted?: boolean;
    listingGrade?: string;
    itemDetails?: string;
    notes?: string;
    saleChannel?: "auction" | "buy_now";
    requestBuyNow?: boolean;
    charity?: boolean;
  };

  const consignorName = session.fullName.trim() || body.consignorName?.trim();
  const title = body.title?.trim();
  if (!consignorName || !title) {
    return NextResponse.json(
      { error: "Your account name and a title are required." },
      { status: 400 },
    );
  }
  if (body.termsAccepted !== true) {
    return NextResponse.json(
      { error: "You must accept the consignment agreement before submitting." },
      { status: 400 },
    );
  }

  let imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls.filter(Boolean) : [];
  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase && imageUrls.length) {
    try {
      imageUrls = await persistPublicImageUrls(supabase, imageUrls);
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? `Could not save photos: ${err.message}`
              : "Could not save photos.",
        },
        { status: 400 },
      );
    }
  }

  const buyNow = Number(body.buyNowPrice ?? body.reservePrice) || 0;
  if ((body.requestBuyNow || body.saleChannel === "buy_now") && buyNow <= 0) {
    return NextResponse.json({ error: "Enter a Buy Now price to list this item there." }, { status: 400 });
  }
  const starting = openingBid(body.startingBid, buyNow, 5);

  const listingGrade = parseListingGrade(body.listingGrade);
  const itemDetails = String(body.itemDetails ?? body.notes ?? "").trim();
  const saleChannel: SaleChannel = "auction";
  const charity = body.charity === true;

  const payload = {
    consignor_name: consignorName,
    contact_email: session.email.trim().toLowerCase() || null,
    owner_id: session.id,
    title,
    category: body.category ?? "Oddities",
    listing_grade: listingGrade,
    condition: listingGrade,
    notes: itemDetails || null,
    description: withListedGrade(body.description ?? "", listingGrade),
    estimated_high: body.estimatedMarketValue ?? null,
    estimated_low: starting,
    starting_bid: starting,
    reserve_price: buyNow || null,
    buy_now_price: buyNow || null,
    commission_rate: DEFAULT_COMMISSION_RATE,
    image_urls: imageUrls,
    status: "pending" as const,
    sale_channel: saleChannel,
    is_charity: charity,
  };

  const item: ConsignorItem = {
    id: crypto.randomUUID(),
    title,
    consignor: consignorName,
    pipelineStatus: "pending_approval",
    startingBid: starting,
    buyNowPrice: buyNow,
    commissionRate: agreementCommission(buyNow)?.rate ?? 0,
    saleChannel,
    charity,
  };

  if (!isSupabaseConfigured || !supabase) {
    addDemoConsignment({
      id: item.id,
      consignor: consignorName,
      title,
      category: payload.category,
      description: payload.description,
      estimatedLow: payload.estimated_low,
      estimatedHigh: payload.estimated_high,
      reservePrice: buyNow,
      buyNowPrice: buyNow,
      startingBid: starting,
      commissionRate: item.commissionRate,
      imageUrls,
      status: "pending",
      listingGrade,
      notes: itemDetails || null,
      condition: listingGrade,
      saleChannel,
      contactEmail: session.email.trim().toLowerCase() || null,
      charity,
    });
    const email = await maybeSendReceivedEmail(session.email, consignorName, item);
    return NextResponse.json({ source: "demo", item, email });
  }

  let { data, error } = await supabase.from("consignments").insert(payload).select("id").single();
  if (error && /listing_grade/i.test(error.message)) {
    const { listing_grade: _g, ...rest } = payload;
    ({ data, error } = await supabase.from("consignments").insert(rest).select("id").single());
  }
  if (error && /buy_now_price/i.test(error.message)) {
    const { buy_now_price: _b, ...rest } = payload;
    ({ data, error } = await supabase.from("consignments").insert(rest).select("id").single());
  }
  if (error && /starting_bid|reserve_price|commission_rate/i.test(error.message)) {
    const { starting_bid: _s, reserve_price: _r, buy_now_price: _b, ...rest } = payload;
    ({ data, error } = await supabase.from("consignments").insert(rest).select("id").single());
  }
  if (error && /contact_email|owner_id/i.test(error.message)) {
    const { contact_email: _e, owner_id: _o, ...rest } = payload;
    ({ data, error } = await supabase.from("consignments").insert(rest).select("id").single());
  }
  if (error && /sale_channel/i.test(error.message)) {
    const { sale_channel: _c, ...rest } = payload;
    ({ data, error } = await supabase.from("consignments").insert(rest).select("id").single());
  }
  if (error && /is_charity/i.test(error.message)) {
    const { is_charity: _charity, ...rest } = payload;
    ({ data, error } = await supabase.from("consignments").insert(rest).select("id").single());
  }
  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Could not save consignment." }, { status: 400 });
  }

  const saved = {
    ...item,
    id: data.id,
  } satisfies ConsignorItem;
  const email = await maybeSendReceivedEmail(session.email, consignorName, saved);
  return NextResponse.json({
    source: "supabase",
    item: saved,
    email,
  });
}

async function maybeSendReceivedEmail(email: string, name: string, item: ConsignorItem) {
  void sendAdminConsignmentAlertEmail({
    consignor: name,
    title: item.title,
    startingBid: item.startingBid,
    buyNowPrice: item.buyNowPrice,
  });
  const result = await sendConsignmentReceivedEmail({
    to: email,
    name,
    items: [
      {
        title: item.title,
        startingBid: item.startingBid,
        buyNowPrice: item.buyNowPrice,
      },
    ],
    commissionRate: DEFAULT_COMMISSION_RATE,
  });
  return { sent: true as const, ...result };
}
