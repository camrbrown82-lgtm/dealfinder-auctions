import { NextRequest, NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { getAdminDemo } from "@/lib/demoAdminStore";
import { ensureSeedBidders, listDemoUsers, setDemoUserFlags } from "@/lib/demoUsers";
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
        paymentFlag:
          row.preauth_status === "held" ? "helcim-hold" : spend > 0 ? "helcim-paid" : "helcim",
        trustedCashUser: Boolean(row.trusted_cash_user),
        isTrustedBuyer: Boolean(row.is_trusted_buyer),
        buyNowLimit: row.buy_now_limit == null ? null : Number(row.buy_now_limit),
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
        paymentFlag: user.preauthStatus === "held" ? "helcim-hold" : "helcim",
        trustedCashUser: Boolean(user.trustedCashUser),
        isTrustedBuyer: Boolean(user.isTrustedBuyer),
        buyNowLimit: user.buyNowLimit ?? 50,
      };
  });

  return NextResponse.json({ customers });
}

export async function PATCH(request: NextRequest) {
  if (!isAdminSession()) return unauthorized();
  const body = (await request.json()) as {
    id?: string;
    status?: "active" | "suspended";
    isTrustedBuyer?: boolean;
    buyNowLimit?: number | null;
  };
  if (!body.id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    const updates: Record<string, unknown> = {};
    if (body.status) updates.status = body.status;
    if (typeof body.isTrustedBuyer === "boolean") updates.is_trusted_buyer = body.isTrustedBuyer;
    if (body.buyNowLimit === null) updates.buy_now_limit = null;
    else if (body.buyNowLimit != null && Number.isFinite(Number(body.buyNowLimit))) {
      updates.buy_now_limit = Number(body.buyNowLimit);
    }
    if (!Object.keys(updates).length) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }
    const { error } = await supabase.from("profiles").update(updates).eq("id", body.id);
    if (error && /is_trusted_buyer|buy_now_limit/i.test(error.message)) {
      const { is_trusted_buyer: _t, buy_now_limit: _l, ...rest } = updates;
      if (!Object.keys(rest).length) {
        return NextResponse.json(
          { error: "Run supabase/sql-editor-buy-now-trusted.sql in the SQL editor." },
          { status: 400 },
        );
      }
      const retry = await supabase.from("profiles").update(rest).eq("id", body.id);
      if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const updated = setDemoUserFlags(body.id, {
    status: body.status,
    isTrustedBuyer: body.isTrustedBuyer,
    buyNowLimit: body.buyNowLimit,
  });
  if (!updated) return NextResponse.json({ error: "User not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
