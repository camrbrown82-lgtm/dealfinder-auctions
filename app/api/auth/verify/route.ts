import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { setBidderCookie } from "@/lib/bidderAuth";
import {
  isAuthEmailConfirmed,
  loadConfirmedAuthUser,
  otpTypesToTry,
} from "@/lib/authEmail";
import { getSupabaseAdmin, getSupabaseAuthClient } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { accessToken?: string; tokenHash?: string; type?: string };
  const accessToken = String(body.accessToken ?? "").trim();
  const tokenHash = String(body.tokenHash ?? "").trim();

  const authClient = getSupabaseAuthClient();
  const admin = getSupabaseAdmin();
  if (!authClient || !admin) {
    return NextResponse.json({ error: "Auth is not configured." }, { status: 400 });
  }

  let userId = "";

  if (tokenHash) {
    let lastError = "This confirmation link is invalid or expired.";
    for (const type of otpTypesToTry(body.type)) {
      const { data, error } = await authClient.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as EmailOtpType,
      });
      if (!error && data.user) {
        userId = data.user.id;
        break;
      }
      if (error?.message) lastError = error.message;
    }
    if (!userId) {
      return NextResponse.json({ error: lastError }, { status: 403 });
    }
  } else if (accessToken) {
    const { data, error } = await authClient.auth.getUser(accessToken);
    if (error || !data.user) {
      return NextResponse.json(
        { error: "Confirm the link in your inbox first." },
        { status: 403 },
      );
    }
    userId = data.user.id;
  } else {
    return NextResponse.json({ error: "Missing confirmation token." }, { status: 400 });
  }

  const confirmed = await loadConfirmedAuthUser(admin, userId);
  if (!userId || !isAuthEmailConfirmed(confirmed)) {
    return NextResponse.json({ error: "Email is not verified yet." }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true, verified: true, redirect: "/live" });
  return setBidderCookie(response, userId);
}
