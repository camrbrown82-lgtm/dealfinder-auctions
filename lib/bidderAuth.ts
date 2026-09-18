import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getDemoUser, publicProfile } from "@/lib/demoUsers";
import { normalizePaymentMethod, type BidderProfile } from "@/lib/profileTypes";
import { BID_PREAUTH_AMOUNT } from "@/lib/helcimCopy";
import { loadBidderPayment, loadTermsAgreed } from "@/lib/helcim";
import { isAuthEmailConfirmed, loadAuthUser } from "@/lib/authEmail";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export const BIDDER_COOKIE = "df_bidder";

function secret() {
  return process.env.ADMIN_PASSWORD || "hammer";
}

export function signBidderId(userId: string) {
  const mac = createHmac("sha256", secret()).update(userId).digest("hex");
  return `${userId}.${mac}`;
}

export function readBidderId(token: string | undefined) {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = createHmac("sha256", secret()).update(userId).digest("hex");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return userId;
}

export function setBidderCookie(response: NextResponse, userId: string) {
  response.cookies.set(BIDDER_COOKIE, signBidderId(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export function clearBidderCookie(response: NextResponse) {
  response.cookies.delete(BIDDER_COOKIE);
  return response;
}

export async function getBidderSession(): Promise<BidderProfile | null> {
  const userId = readBidderId(cookies().get(BIDDER_COOKIE)?.value);
  if (!userId) return null;

  if (isSupabaseConfigured) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const authUser = await loadAuthUser(supabase, userId);
      if (!authUser || !isAuthEmailConfirmed(authUser)) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (!error && data) {
        const payment = await loadBidderPayment(data.id);
        const agreed = await loadTermsAgreed(data.id);
        return {
          id: data.id,
          email: data.email ?? "",
          fullName: data.full_name ?? "",
          phone: data.phone ?? "",
          street: data.street ?? "",
          city: data.city ?? "",
          province: data.province ?? "",
          postalCode: data.postal_code ?? "",
          paymentMethod: normalizePaymentMethod(data.payment_method),
          status: data.status === "suspended" ? "suspended" : "active",
          preauthStatus: payment.preauthStatus,
          preauthAmount: payment.preauthAmount || Number(data.preauth_amount ?? BID_PREAUTH_AMOUNT) || BID_PREAUTH_AMOUNT,
          hasCardOnFile: payment.hasCardOnFile,
          preauthTermsAgreed: agreed || Boolean(data.preauth_terms_agreed_at),
          trustedCashUser: Boolean(data.trusted_cash_user),
          isTrustedBuyer: Boolean(data.is_trusted_buyer),
          buyNowLimit: data.buy_now_limit == null ? null : Number(data.buy_now_limit),
        };
      }
    }
  }

  const demo = getDemoUser(userId);
  return demo ? publicProfile(demo) : null;
}

export function bidderUnauthorized() {
  return NextResponse.json({ error: "Log in to bid." }, { status: 401 });
}
