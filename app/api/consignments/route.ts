import { NextRequest, NextResponse } from "next/server";
import { addDemoConsignment } from "@/lib/demoAdminStore";
import { persistPublicImageUrls } from "@/lib/consignmentStorage";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
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
    reservePrice: 80,
    commissionRate: DEFAULT_COMMISSION_RATE,
  }));

  const fromLots: ConsignorItem[] = MOCK_LOTS.map((lot) => ({
    id: lot.id,
    title: lot.title,
    consignor: lot.consignor,
    pipelineStatus: lot.status === "ended" ? "sold" : "live",
    startingBid: lot.currentBid,
    reservePrice: lot.currentBid,
    commissionRate: DEFAULT_COMMISSION_RATE,
  }));

  return [...fromQueue, ...fromLots];
}

export async function GET(request: NextRequest) {
  const consignor = request.nextUrl.searchParams.get("consignor")?.trim().toLowerCase();
  const supabase = getSupabaseAdmin();

  if (!isSupabaseConfigured || !supabase) {
    const items = consignor
      ? demoItems().filter((item) => item.consignor.toLowerCase().includes(consignor))
      : demoItems();
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

  const items: ConsignorItem[] = (queueRes.data ?? []).map((row) => {
    const lot = lotByConsignment.get(row.id);
    let pipelineStatus: ConsignorItem["pipelineStatus"] = consignmentToPipeline(row.status);
    if (lot?.status === "paused" || lot?.status === "draft") pipelineStatus = "scheduled";
    if (lot?.status === "live") pipelineStatus = "live";
    if (lot?.status === "ended") pipelineStatus = "sold";

    return {
      id: row.id,
      title: row.title,
      consignor: row.consignor_name,
      pipelineStatus,
      startingBid: Number(row.starting_bid ?? lot?.starting_bid ?? 0),
      reservePrice: Number(row.reserve_price ?? 0),
      commissionRate: Number(row.commission_rate ?? DEFAULT_COMMISSION_RATE),
    };
  });

  const filtered = consignor
    ? items.filter((item) => item.consignor.toLowerCase().includes(consignor))
    : items;

  return NextResponse.json({ source: "supabase", items: filtered });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    consignorName?: string;
    title?: string;
    description?: string;
    category?: LotCategory;
    startingBid?: number;
    reservePrice?: number;
    commissionRate?: number;
    estimatedMarketValue?: number;
    imageUrls?: string[];
  };

  const consignorName = body.consignorName?.trim();
  const title = body.title?.trim();
  if (!consignorName || !title) {
    return NextResponse.json(
      { error: "Consignor name and title are required." },
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

  const payload = {
    consignor_name: consignorName,
    title,
    category: body.category ?? "Oddities",
    description: body.description ?? "",
    estimated_high: body.estimatedMarketValue ?? null,
    estimated_low: body.startingBid ?? null,
    starting_bid: Number(body.startingBid) || 0,
    reserve_price: Number(body.reservePrice) || 0,
    commission_rate: Number(body.commissionRate) || DEFAULT_COMMISSION_RATE,
    image_urls: imageUrls,
    status: "pending" as const,
  };

  const item: ConsignorItem = {
    id: crypto.randomUUID(),
    title,
    consignor: consignorName,
    pipelineStatus: "pending_approval",
    startingBid: payload.starting_bid,
    reservePrice: payload.reserve_price,
    commissionRate: payload.commission_rate,
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
      reservePrice: payload.reserve_price,
      startingBid: payload.starting_bid,
      commissionRate: payload.commission_rate,
      imageUrls,
      status: "pending",
    });
    return NextResponse.json({ source: "demo", item });
  }

  let { data, error } = await supabase.from("consignments").insert(payload).select("id").single();
  if (error && /starting_bid|reserve_price|commission_rate/i.test(error.message)) {
    const {
      starting_bid: _s,
      reserve_price: _r,
      commission_rate: _c,
      ...rest
    } = payload;
    ({ data, error } = await supabase.from("consignments").insert(rest).select("id").single());
  }

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Could not save consignment." }, { status: 400 });
  }

  return NextResponse.json({
    source: "supabase",
    item: {
      ...item,
      id: data.id,
    } satisfies ConsignorItem,
  });
}
