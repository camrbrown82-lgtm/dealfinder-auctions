import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BIDDER_COOKIE, readBidderId, signBidderId } from "@/lib/bidderCookie";
import { getDemoUser, publicProfile } from "@/lib/demoUsers";
import { normalizePaymentMethod, type BidderProfile } from "@/lib/profileTypes";
import { BID_PREAUTH_AMOUNT } from "@/lib/helcimCopy";
import { loadBidderPayment, loadTermsAgreed } from "@/lib/helcim";
import { isAuthEmailConfirmed, loadAuthUser } from "@/lib/authEmail";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export { BIDDER_COOKIE, readBidderId, signBidderId };

function dropAdminCookie(response: NextResponse) {
  response.cookies.set("df_admin", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production",
  });
}

export function setBidderCookie(response: NextResponse, userId: string) {
  response.cookies.set(BIDDER_COOKIE, signBidderId(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });
  dropAdminCookie(response);
  return response;
}

export function clearBidderCookie(response: NextResponse) {
  response.cookies.delete(BIDDER_COOKIE);
  dropAdminCookie(response);
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
