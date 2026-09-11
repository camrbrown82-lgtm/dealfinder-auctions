import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getDemoUser, publicProfile } from "@/lib/demoUsers";
import { isPaymentMethod, type BidderProfile } from "@/lib/profileTypes";
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
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (!error && data) {
        return {
          id: data.id,
          email: data.email ?? "",
          fullName: data.full_name ?? "",
          phone: data.phone ?? "",
          street: data.street ?? "",
          city: data.city ?? "",
          province: data.province ?? "",
          postalCode: data.postal_code ?? "",
          paymentMethod: isPaymentMethod(data.payment_method)
            ? data.payment_method
            : "interac_etransfer",
          status: data.status === "suspended" ? "suspended" : "active",
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
