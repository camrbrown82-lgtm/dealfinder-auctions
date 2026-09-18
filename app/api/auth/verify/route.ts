import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { setBidderCookie } from "@/lib/bidderAuth";
import { isAuthEmailConfirmed } from "@/lib/authEmail";
import { getSupabaseAdmin, getSupabaseAuthClient } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

function asOtpType(value: string): EmailOtpType {
  const type = value.toLowerCase();
  if (
    type === "signup" ||
    type === "invite" ||
    type === "magiclink" ||
    type === "recovery" ||
    type === "email_change" ||
    type === "email"
  ) {
    return type;
  }
  return "signup";
}

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
  let confirmed = false;

  if (tokenHash) {
    const { data, error } = await authClient.auth.verifyOtp({
      token_hash: tokenHash,
      type: asOtpType(String(body.type ?? "signup")),
    });
    if (error || !data.user) {
      return NextResponse.json(
        { error: error?.message || "This confirmation link is invalid or expired." },
        { status: 403 },
      );
    }
    userId = data.user.id;
    confirmed = isAuthEmailConfirmed(data.user) || Boolean(data.session);
  } else if (accessToken) {
    const { data, error } = await authClient.auth.getUser(accessToken);
    if (error || !data.user || !isAuthEmailConfirmed(data.user)) {
      return NextResponse.json(
        { error: "Confirm the link in your inbox first." },
        { status: 403 },
      );
    }
    userId = data.user.id;
    confirmed = true;
  } else {
    return NextResponse.json({ error: "Missing confirmation token." }, { status: 400 });
  }

  if (!confirmed || !userId) {
    return NextResponse.json({ error: "Email is not verified yet." }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true, verified: true, redirect: "/live" });
  return setBidderCookie(response, userId);
}
