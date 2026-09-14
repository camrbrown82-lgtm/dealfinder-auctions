import { NextRequest, NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { getAdminDemo } from "@/lib/demoAdminStore";
import { ensureSeedBidders, listDemoUsers, setDemoUserStatus } from "@/lib/demoUsers";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { CustomerRow } from "@/lib/adminTypes";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAdminSession()) return unauthorized();
  ensureSeedBidders();

  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    const { data: profiles, error } = await supabase.from("profiles").select("*");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const { data: lots } = await supabase
      .from("lots")
      .select("high_bidder_id, current_bid, status");
    const customers: CustomerRow[] = (profiles ?? []).map((row) => {
      const wins = (lots ?? []).filter(
        (lot) => lot.high_bidder_id === row.id && lot.status === "ended",
      );
      const spend = wins.reduce((sum, lot) => sum + Number(lot.current_bid ?? 0), 0);
      return {
        id: row.id,
        email: row.email ?? "",
        fullName: row.full_name ?? "",
        status: row.status === "suspended" ? "suspended" : "active",
        phone: row.phone ?? "",
        street: row.street ?? "",
        city: row.city ?? "",
        province: row.province ?? "",
        postalCode: row.postal_code ?? "",
        paymentMethod: row.payment_method ?? "",
        auctionsWon: wins.length,
        lifetimeSpend: spend,
        paymentFlag: spend > 0 ? "has_invoices" : "none",
      };
    });
    return NextResponse.json({ customers });
  }

  const demo = getAdminDemo();
  const customers: CustomerRow[] = listDemoUsers().map((user) => {
    const wins = demo.inventory.filter(
      (lot) =>
        (lot.highBidderId === user.id || lot.highBidder === user.fullName) &&
        lot.status === "ended",
    );
    const spend = wins.reduce((sum, lot) => sum + lot.currentBid, 0);
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      status: user.status ?? "active",
      phone: user.phone,
      street: user.street,
      city: user.city,
      province: user.province,
      postalCode: user.postalCode,
      paymentMethod: user.paymentMethod,
      auctionsWon: wins.length,
      lifetimeSpend: spend,
      paymentFlag: user.paymentMethod === "interac_etransfer" ? "interac" : "pickup",
    };
  });

  return NextResponse.json({ customers });
}

export async function PATCH(request: NextRequest) {
  if (!isAdminSession()) return unauthorized();
  const body = (await request.json()) as { id?: string; status?: "active" | "suspended" };
  if (!body.id || !body.status) {
    return NextResponse.json({ error: "id and status are required." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from("profiles").update({ status: body.status }).eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const updated = setDemoUserStatus(body.id, body.status);
  if (!updated) return NextResponse.json({ error: "User not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
