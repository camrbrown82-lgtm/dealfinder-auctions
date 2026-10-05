import { NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { buildConsignorLedger } from "@/lib/consignorLedger";
import { getAdminDemo, stampAuctionNumbers } from "@/lib/demoAdminStore";
import { mapAuctionEvent } from "@/lib/mapAuctionEvent";
import { mapConsignment, mapLot, type ConsignmentRow, type LotRow } from "@/lib/mappers";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { AuctionEvent } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAdminSession()) return unauthorized();

  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) {
    const demo = getAdminDemo();
    stampAuctionNumbers(demo);
    return NextResponse.json({
      source: "demo",
      groups: buildConsignorLedger({
        consignments: demo.queue,
        lots: demo.inventory,
        events: demo.events,
      }),
    });
  }

  const [queueRes, lotsRes, eventsRes] = await Promise.all([
    supabase.from("consignments").select("*").order("created_at", { ascending: false }),
    supabase.from("lots").select("*").order("created_at", { ascending: false }),
    supabase.from("auction_events").select("*"),
  ]);

  if (queueRes.error || lotsRes.error) {
    return NextResponse.json(
      { error: queueRes.error?.message || lotsRes.error?.message || "Could not read consignments." },
      { status: 500 },
    );
  }

  const rows = (queueRes.data ?? []) as Array<ConsignmentRow & { created_at?: string | null }>;
  // created_at is not part of the mapped Consignment, so carry it alongside.
  const submittedAt = new Map(
    rows.filter((row) => row.created_at).map((row) => [String(row.id), String(row.created_at)]),
  );
  const events: AuctionEvent[] = (eventsRes.data ?? []).map((row) =>
    mapAuctionEvent(row as Parameters<typeof mapAuctionEvent>[0]),
  );

  return NextResponse.json({
    source: "supabase",
    groups: buildConsignorLedger({
      consignments: rows.map((row) => mapConsignment(row)),
      lots: ((lotsRes.data ?? []) as LotRow[]).map((row) => mapLot(row)),
      events,
      submittedAt,
    }),
  });
}
