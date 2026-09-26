import { NextRequest, NextResponse } from "next/server";
import { getBidderSession } from "@/lib/bidderAuth";
import { type ConsignmentMailLine } from "@/lib/commission";
import { sendConsignmentReceivedEmail } from "@/lib/notify";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { DEFAULT_COMMISSION_RATE } from "@/lib/utils";

export const dynamic = "force-dynamic";

type IncomingItem = {
  id?: string;
  title?: string;
  startingBid?: number;
  buyNowPrice?: number;
};

export async function POST(request: NextRequest) {
  const session = await getBidderSession();
  if (!session) {
    return NextResponse.json({ error: "Log in to email your consignment list." }, { status: 401 });
  }

  const body = (await request.json()) as { items?: IncomingItem[] };
  const incoming = Array.isArray(body.items) ? body.items : [];
  if (!incoming.length) {
    return NextResponse.json({ error: "Add at least one consignment to email." }, { status: 400 });
  }

  const fromClient: ConsignmentMailLine[] = incoming
    .map((row) => ({
      title: String(row.title ?? "").trim(),
      startingBid: Number(row.startingBid) || 0,
      buyNowPrice: Number(row.buyNowPrice) || 0,
    }))
    .filter((row) => row.title);

  const supabase = getSupabaseAdmin();
  const ids = incoming.map((row) => String(row.id ?? "").trim()).filter(Boolean);
  if (isSupabaseConfigured && supabase && ids.length) {
    const { data } = await supabase
      .from("consignments")
      .select("id, title, starting_bid, buy_now_price, reserve_price, owner_id, contact_email, consignor_name")
      .in("id", ids);
    const owned = (data ?? []).filter((row) => {
      if (row.owner_id && row.owner_id === session.id) return true;
      const email = String(row.contact_email ?? "").trim().toLowerCase();
      return email && email === session.email.trim().toLowerCase();
    });
    if (owned.length) {
      const byId = new Map(owned.map((row) => [String(row.id), row]));
      const lines: ConsignmentMailLine[] = incoming
        .map((row) => {
          const saved = row.id ? byId.get(row.id) : undefined;
          if (saved) {
            return {
              title: String(saved.title ?? row.title ?? "").trim(),
              startingBid: Number(saved.starting_bid ?? row.startingBid ?? 0),
              buyNowPrice: Number(saved.buy_now_price ?? saved.reserve_price ?? row.buyNowPrice ?? 0),
            };
          }
          return {
            title: String(row.title ?? "").trim(),
            startingBid: Number(row.startingBid) || 0,
            buyNowPrice: Number(row.buyNowPrice) || 0,
          };
        })
        .filter((row) => row.title);
      const result = await sendConsignmentReceivedEmail({
        to: session.email,
        name: session.fullName,
        items: lines,
        commissionRate: DEFAULT_COMMISSION_RATE,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error || "Could not send confirmation email." }, { status: 400 });
      }
      return NextResponse.json({ ok: true, email: result, count: lines.length });
    }
  }

  if (!fromClient.length) {
    return NextResponse.json({ error: "Add at least one consignment to email." }, { status: 400 });
  }

  const result = await sendConsignmentReceivedEmail({
    to: session.email,
    name: session.fullName,
    items: fromClient,
    commissionRate: DEFAULT_COMMISSION_RATE,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error || "Could not send confirmation email." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, email: result, count: fromClient.length });
}
